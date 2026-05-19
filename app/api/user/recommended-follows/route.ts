import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/lib/generated/prisma/client";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { userNotPendingHardDelete } from "@/lib/user-not-pending-deletion";

/**
 * Signal weights — FoF outranks engagement; popular fill-in last.
 */
const WEIGHT_FOF = 3;
const WEIGHT_ENGAGEMENT = 1.5;
const WEIGHT_LOG_FOLLOWERS = 0.4;

const FOF_LIMIT = 200;
const ENGAGEMENT_LOOKBACK_DAYS = 30;

type Reason =
  | { kind: "fof"; mutuals: number }
  | { kind: "engagement"; likes: number }
  | { kind: "popular" };

type Candidate = {
  userId: string;
  fofMutuals: number;
  engagementLikes: number;
};

function pickPrimaryReason(c: Candidate): Reason {
  if (c.fofMutuals > 0) return { kind: "fof", mutuals: c.fofMutuals };
  if (c.engagementLikes > 0) return { kind: "engagement", likes: c.engagementLikes };
  return { kind: "popular" };
}

/** GET /api/user/recommended-follows?limit=20 — heuristic suggestion ranker. */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const limit = Math.max(1, Math.min(50, Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20));

  const [following, blockedIds] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: me.userId },
      select: { followingId: true },
    }),
    getBlockedUserIds(me.userId),
  ]);

  const followingIds = following.map((f) => f.followingId);
  const excludedIds = new Set<string>([me.userId, ...followingIds, ...blockedIds]);

  // --- Friends-of-friends (raw SQL — single round-trip aggregation) -----------
  const fofRows = followingIds.length === 0
    ? []
    : await prisma.$queryRaw<{ id: string; mutuals: bigint }[]>(
        Prisma.sql`
          SELECT f."followingId" AS "id", COUNT(*)::bigint AS "mutuals"
          FROM "Follow" f
          INNER JOIN "User" u ON u.id = f."followingId" AND u."accountDeletionRequestedAt" IS NULL
          WHERE f."followerId" IN (${Prisma.join(followingIds)})
            AND f."followingId" NOT IN (${Prisma.join(Array.from(excludedIds))})
          GROUP BY f."followingId"
          ORDER BY COUNT(*) DESC
          LIMIT ${FOF_LIMIT}
        `,
      );

  // --- Engagement affinity (authors of posts I recently liked) ---------------
  const since = new Date(Date.now() - ENGAGEMENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const recentLikes = await prisma.like.findMany({
    where: { userId: me.userId, createdAt: { gte: since } },
    select: { post: { select: { authorId: true } } },
    take: 500,
  });

  const engagementMap = new Map<string, number>();
  for (const row of recentLikes) {
    const authorId = row.post?.authorId;
    if (!authorId || excludedIds.has(authorId)) continue;
    engagementMap.set(authorId, (engagementMap.get(authorId) ?? 0) + 1);
  }

  const candidates = new Map<string, Candidate>();
  const ensure = (userId: string): Candidate => {
    let entry = candidates.get(userId);
    if (!entry) {
      entry = { userId, fofMutuals: 0, engagementLikes: 0 };
      candidates.set(userId, entry);
    }
    return entry;
  };

  for (const row of fofRows) ensure(row.id).fofMutuals = Number(row.mutuals);
  for (const [userId, likes] of engagementMap) ensure(userId).engagementLikes = likes;

  if (candidates.size === 0) {
    const fallback = await prisma.user.findMany({
      where: { id: { notIn: Array.from(excludedIds) }, ...userNotPendingHardDelete },
      orderBy: { followers: { _count: "desc" } },
      take: limit,
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isVerified: true,
        _count: { select: { followers: true } },
      },
    });
    return NextResponse.json({
      users: fallback.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        isVerified: u.isVerified,
        followerCount: u._count.followers,
        score: 0,
        reason: { kind: "popular" } as Reason,
        followedByMe: false,
      })),
      coldStart: true,
    });
  }

  const candidateIds = Array.from(candidates.keys());
  const users = await prisma.user.findMany({
    where: { id: { in: candidateIds }, ...userNotPendingHardDelete },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
      _count: { select: { followers: true } },
    },
  });

  const ranked = users
    .map((u) => {
      const c = candidates.get(u.id)!;
      const followerBoost = WEIGHT_LOG_FOLLOWERS * Math.log10(Math.max(1, u._count.followers));
      const score =
        WEIGHT_FOF * c.fofMutuals +
        WEIGHT_ENGAGEMENT * c.engagementLikes +
        followerBoost;
      return {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        isVerified: u.isVerified,
        followerCount: u._count.followers,
        score: Number(score.toFixed(3)),
        reason: pickPrimaryReason(c),
        followedByMe: false,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return NextResponse.json({ users: ranked, coldStart: false });
}
