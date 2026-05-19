import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { formatPollForViewer } from "@/lib/polls";
import { Prisma } from "@/lib/generated/prisma/client";
import { publishedPostWhere } from "@/lib/post-schedule";
import { approvedCommentsOnlyCount } from "@/lib/post-comment-moderation";

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true,
  creatorMode: true,
  level: true,
} as const;

const RELATED_LIMIT = 12;

function isMissingPollTable(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2021" &&
    String((error as Error).message).includes("public.Poll")
  );
}

// GET /api/posts/[id]/related — similarity by shared hashtags (+ engagement tie-in).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const blockedIds = await getBlockedUserIds(user.userId);
  const mutedRows = await prisma.mute.findMany({
    where: { muterId: user.userId, mutePosts: true },
    select: { mutedId: true },
  });
  const excludeAuthors = [...new Set([...blockedIds, ...mutedRows.map((m) => m.mutedId)])];

  const base = await prisma.post.findUnique({
    where: { id },
    select: {
      id: true,
      hashtags: { select: { hashtagId: true } },
    },
  });

  if (!base) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const hashtagIds = base.hashtags.map((h) => h.hashtagId);
  type ScoreRow = {
    overlap: number;
    engagement: number;
    createdMs: number;
  };
  const scoreMap = new Map<string, ScoreRow>();

  function bump(postId: string, patch: Partial<ScoreRow> & Pick<ScoreRow, "overlap">) {
    const prev = scoreMap.get(postId);
    if (!prev) {
      scoreMap.set(postId, {
        overlap: patch.overlap,
        engagement: patch.engagement ?? 0,
        createdMs: patch.createdMs ?? 0,
      });
      return;
    }
    prev.overlap = Math.max(prev.overlap, patch.overlap);
    if (patch.engagement != null) prev.engagement = Math.max(prev.engagement, patch.engagement);
    if (patch.createdMs != null) prev.createdMs = Math.max(prev.createdMs, patch.createdMs);
  }

  if (hashtagIds.length) {
    const tagLinks = await prisma.postHashtag.findMany({
      where: {
        hashtagId: { in: hashtagIds },
        postId: { not: id },
        post: {
          audience: "PUBLIC",
          authorId: { notIn: excludeAuthors },
          AND: publishedPostWhere(),
        },
      },
      select: { postId: true },
    });

    const overlapCount = new Map<string, number>();
    for (const row of tagLinks) {
      overlapCount.set(row.postId, (overlapCount.get(row.postId) ?? 0) + 1);
    }

    const relatedIdsFromTags = [...overlapCount.keys()];
    if (relatedIdsFromTags.length) {
      const posts = await prisma.post.findMany({
        where: { id: { in: relatedIdsFromTags } },
        select: {
          id: true,
          likeCount: true,
          commentCount: true,
          createdAt: true,
        },
      });
      for (const p of posts) {
        bump(p.id, {
          overlap: overlapCount.get(p.id) ?? 0,
          engagement: p.likeCount + p.commentCount * 2,
          createdMs: p.createdAt.getTime(),
        });
      }
    }
  }

  let rankedIds = [...scoreMap.entries()]
    .map(([pid, meta]) => {
      const hashtagScore = meta.overlap * 55;
      const hotScore = Math.log2(meta.engagement + 10) * 12;
      const ageDays = meta.createdMs > 0 ? (Date.now() - meta.createdMs) / (24 * 60 * 60 * 1000) : 30;
      const recencyBoost = Math.max(0, Math.min(18, 18 - ageDays));
      return { id: pid, score: hashtagScore + hotScore + recencyBoost };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, RELATED_LIMIT)
    .map((r) => r.id);

  if (rankedIds.length === 0) {
    const fallback = await prisma.post.findMany({
      where: {
        AND: [
          {
            id: { not: id },
            audience: "PUBLIC",
            authorId: { notIn: excludeAuthors },
          },
          publishedPostWhere(),
        ],
      },
      orderBy: [{ likeCount: "desc" }, { commentCount: "desc" }, { createdAt: "desc" }],
      take: RELATED_LIMIT,
      select: { id: true },
    });
    rankedIds = fallback.map((p) => p.id);
  }

  if (rankedIds.length === 0) {
    return NextResponse.json({ posts: [] });
  }

  try {
    const posts = await prisma.post.findMany({
      where: { id: { in: rankedIds } },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { likes: true, ...approvedCommentsOnlyCount } },
        likes: { where: { userId: user.userId }, select: { userId: true } },
        saved: { where: { userId: user.userId }, select: { userId: true } },
        poll: {
          include: {
            votes: { select: { userId: true, optionIndex: true } },
          },
        },
      },
    });
    const order = new Map(rankedIds.map((pid, idx) => [pid, idx]));
    posts.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));

    return NextResponse.json({
      posts: posts.map((p) => ({
        ...p,
        likedByMe: p.likes.length > 0,
        savedByMe: p.saved.length > 0,
        isCloseCircle: false,
        poll: "poll" in p ? formatPollForViewer((p as { poll: Parameters<typeof formatPollForViewer>[0] }).poll, user.userId) : null,
        likes: undefined,
        saved: undefined,
      })),
      nextCursor: null,
    });
  } catch (error) {
    if (!isMissingPollTable(error)) throw error;
    const posts = await prisma.post.findMany({
      where: { id: { in: rankedIds } },
      include: {
        author: { select: AUTHOR_SELECT },
        _count: { select: { likes: true, ...approvedCommentsOnlyCount } },
        likes: { where: { userId: user.userId }, select: { userId: true } },
        saved: { where: { userId: user.userId }, select: { userId: true } },
      },
    });
    const order = new Map(rankedIds.map((pid, idx) => [pid, idx]));
    posts.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));

    return NextResponse.json({
      posts: posts.map((p) => ({
        ...p,
        likedByMe: p.likes.length > 0,
        savedByMe: p.saved.length > 0,
        isCloseCircle: false,
        poll: null,
        likes: undefined,
        saved: undefined,
      })),
      nextCursor: null,
    });
  }
}
