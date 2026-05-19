import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { primaryMediaKind } from "@/lib/media";
import { upsertSearchHistory } from "@/lib/search-history";
import { logBackgroundError } from "@/lib/logger";
import { publishedPostWhere } from "@/lib/post-schedule";
import { approvedCommentsOnlyCount } from "@/lib/post-comment-moderation";
import type { PrimaryMediaKind } from "@/lib/media";
import type { Prisma } from "@/lib/generated/prisma/client";

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

const MAX_RESULTS = 36;
const FETCH_CAP = 180;

function parseNonNegInt(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, 1_000_000);
}

function parseOptionalDate(raw: string | null, endOfDay = false): Date | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) {
    d.setUTCHours(23, 59, 59, 999);
  } else {
    d.setUTCHours(0, 0, 0, 0);
  }
  return d;
}

function parseMediaType(raw: string | null): PrimaryMediaKind | "any" {
  const v = raw?.trim().toLowerCase();
  if (v === "image" || v === "video") return v;
  return "any";
}

export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ posts: [] });

  const from = parseOptionalDate(req.nextUrl.searchParams.get("from"));
  const toRaw = req.nextUrl.searchParams.get("to")?.trim();
  const to = toRaw ? parseOptionalDate(toRaw, true) : null;
  const minLikes = parseNonNegInt(req.nextUrl.searchParams.get("minLikes"));
  const minComments = parseNonNegInt(req.nextUrl.searchParams.get("minComments"));
  const minEngagement = parseNonNegInt(req.nextUrl.searchParams.get("minEngagement"));
  const mediaType = parseMediaType(req.nextUrl.searchParams.get("mediaType"));

  const blockedIds = await getBlockedUserIds(me.userId);

  const textOr: Prisma.PostWhereInput[] = [
    { caption: { contains: q, mode: "insensitive" } },
    { location: { contains: q, mode: "insensitive" } },
    { author: { username: { contains: q, mode: "insensitive" } } },
    { author: { displayName: { contains: q, mode: "insensitive" } } },
  ];

  const AND: Prisma.PostWhereInput[] = [
    { authorId: { notIn: blockedIds } },
    { OR: textOr },
    publishedPostWhere(),
  ];

  if (from != null || to != null) {
    AND.push({
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      },
    });
  }

  if (minLikes != null) AND.push({ likeCount: { gte: minLikes } });
  if (minComments != null) AND.push({ commentCount: { gte: minComments } });

  upsertSearchHistory(me.userId, q).catch(logBackgroundError("search.history.upsert"));

  const posts = await prisma.post.findMany({
    where: { AND },
    orderBy: { createdAt: "desc" },
    take: FETCH_CAP,
    include: {
      author: { select: AUTHOR_SELECT },
      _count: { select: { likes: true, ...approvedCommentsOnlyCount } },
      likes: { where: { userId: me.userId }, select: { userId: true } },
      saved: { where: { userId: me.userId }, select: { userId: true } },
    },
  });

  const engagementScore = (p: { likeCount: number; commentCount: number }) =>
    p.likeCount + p.commentCount * 2;

  let filtered = posts;
  if (minEngagement != null) {
    filtered = filtered.filter((p) => engagementScore(p) >= minEngagement);
  }

  if (mediaType !== "any") {
    filtered = filtered.filter((p) => primaryMediaKind(p.mediaUrls ?? []) === mediaType);
  }

  filtered = filtered.slice(0, MAX_RESULTS);

  return NextResponse.json({
    posts: filtered.map((post) => ({
      ...post,
      likedByMe: post.likes.length > 0,
      savedByMe: post.saved.length > 0,
      likes: undefined,
      saved: undefined,
    })),
    appliedFilters: {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      minLikes,
      minComments,
      minEngagement,
      mediaType,
    },
  });
}
