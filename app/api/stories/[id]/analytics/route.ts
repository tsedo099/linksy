import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { activeStoryWhere } from "@/lib/story-visibility";

/**
 * GET /api/stories/[id]/analytics — owner-only analytics for one story.
 *
 * Returns:
 *   - viewCount, reactionCount, replyCount (story-reply DMs from non-owner)
 *   - reachRate         = uniqueViewers / followerCount (0 when followerCount=0)
 *   - completionRate    = viewersWhoSawAllSiblingStoriesInBatch / viewersOfThisStory
 *                         ("batch" = the author's currently active story set,
 *                          so this collapses to 1 for single-story batches)
 *   - dropOff           = sequence of `{ storyId, viewerCount, dropFromPrev }` ordered
 *                          oldest → newest across the active batch
 *   - topReactions      = top 5 emoji + counts
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: storyId } = await params;
  const now = new Date();

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      authorId: true,
      audience: true,
      createdAt: true,
      expiresAt: true,
    },
  });
  if (!story) return NextResponse.json({ error: "Story not found." }, { status: 404 });
  if (story.authorId !== me.userId) {
    return NextResponse.json({ error: "Only the author can view analytics." }, { status: 403 });
  }

  const [viewCount, reactionCount, followerCount, batch, reactionRows] = await Promise.all([
    prisma.storyView.count({
      where: { storyId, userId: { not: story.authorId } },
    }),
    prisma.storyReaction.count({ where: { storyId } }),
    prisma.follow.count({ where: { followingId: story.authorId } }),
    prisma.story.findMany({
      where: {
        authorId: story.authorId,
        ...activeStoryWhere(now),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        _count: { select: { views: true } },
      },
    }),
    prisma.storyReaction.groupBy({
      by: ["emoji"],
      where: { storyId },
      _count: { _all: true },
      orderBy: { _count: { emoji: "desc" } },
      take: 5,
    }),
  ]);

  const viewerIds = await prisma.storyView.findMany({
    where: { storyId, userId: { not: story.authorId } },
    select: { userId: true },
  });

  let completionRate: number | null = null;
  if (batch.length > 1 && viewerIds.length > 0) {
    const otherStoryIds = batch.map((entry) => entry.id).filter((id) => id !== storyId);
    const completionRows = await prisma.storyView.groupBy({
      by: ["userId"],
      where: {
        storyId: { in: otherStoryIds },
        userId: { in: viewerIds.map((row) => row.userId) },
      },
      _count: { storyId: true },
    });
    const completed = completionRows.filter((row) => row._count.storyId === otherStoryIds.length).length;
    completionRate = completed / viewerIds.length;
  } else if (batch.length === 1) {
    completionRate = viewerIds.length > 0 ? 1 : null;
  }

  // Drop-off curve: viewer count by story in batch, oldest→newest, with the
  // delta from the previous step so callers can render a sparkline directly.
  const dropOff = batch.map((entry, idx) => {
    const viewers = entry._count.views;
    const prev = idx === 0 ? viewers : (batch[idx - 1]?._count.views ?? viewers);
    return {
      storyId: entry.id,
      viewerCount: viewers,
      dropFromPrev: idx === 0 ? 0 : prev === 0 ? 0 : (prev - viewers) / prev,
      isCurrent: entry.id === storyId,
    };
  });

  const reachRate = followerCount > 0 ? viewCount / followerCount : null;

  return NextResponse.json({
    storyId,
    audience: story.audience,
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    viewCount,
    reactionCount,
    followerCount,
    reachRate,
    completionRate,
    dropOff,
    topReactions: reactionRows.map((row) => ({
      emoji: row.emoji,
      count: row._count._all,
    })),
  });
}
