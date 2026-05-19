import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { areUsersBlocked, getBlockedUserIds } from "@/lib/user-blocks";
import { publishedPostWhere, visibleToViewerPostWhere } from "@/lib/post-schedule";
import { approvedCommentsOnlyCount } from "@/lib/post-comment-moderation";
import { parseRequestJson } from "@/lib/request-json";
import { postSeriesUpdateSchema } from "@/lib/schemas/api-bodies";
import { sanitizePlainText } from "@/lib/sanitize-html";
import type { Prisma } from "@/lib/generated/prisma/client";

// GET /api/post-series/[id] — ordered posts in the series (visibility-aware for non-owners)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: seriesId } = await params;

  const series = await prisma.postSeries.findUnique({
    where: { id: seriesId },
    select: { id: true, title: true, userId: true },
  });

  if (!series) return NextResponse.json({ error: "Series not found." }, { status: 404 });
  if (await areUsersBlocked(user.userId, series.userId)) {
    return NextResponse.json({ error: "Unavailable." }, { status: 403 });
  }

  const now = new Date();
  const isOwner = user.userId === series.userId;

  let postsWhere: Prisma.PostWhereInput;
  if (isOwner) {
    postsWhere = {
      seriesId,
      authorId: series.userId,
      OR: visibleToViewerPostWhere(series.userId, now).OR,
    };
  } else {
    const blockedIds = await getBlockedUserIds(user.userId);
    const blockedSet = new Set(blockedIds);
    const following = await prisma.follow.findMany({
      where: { followerId: user.userId },
      select: { followingId: true },
    });
    const followingIds = following.map((f) => f.followingId).filter((fid) => !blockedSet.has(fid));
    const circleRows = await prisma.closeCircle.findMany({
      where: { userId: user.userId },
      select: { targetId: true },
    });
    const circleIds = circleRows.map((r) => r.targetId).filter((tid) => !blockedSet.has(tid));
    const friendsAndSelf = [...followingIds, user.userId];
    const circleAndSelf = [...circleIds, user.userId];

    postsWhere = {
      AND: [
        { seriesId, authorId: series.userId },
        publishedPostWhere(now),
        {
          OR: [
            { audience: "PUBLIC" },
            { audience: "FRIENDS", authorId: { in: friendsAndSelf } },
            { audience: "CLOSE_CIRCLE", authorId: { in: circleAndSelf } },
          ],
        },
      ],
    };
  }

  const posts = await prisma.post.findMany({
    where: postsWhere,
    orderBy: [{ seriesPosition: "asc" }, { createdAt: "asc" }],
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isVerified: true,
        },
      },
      _count: { select: { likes: true, ...approvedCommentsOnlyCount } },
      likes: { where: { userId: user.userId }, select: { userId: true } },
      saved: { where: { userId: user.userId }, select: { userId: true } },
    },
  });

  return NextResponse.json({
    series: { id: series.id, title: series.title, ownerId: series.userId, isOwner },
    posts: posts.map((p) => ({
      ...p,
      likedByMe: p.likes.length > 0,
      savedByMe: p.saved.length > 0,
      likes: undefined,
      saved: undefined,
    })),
  });
}

// PATCH /api/post-series/[id] — rename a series (owner only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: seriesId } = await params;

  const series = await prisma.postSeries.findUnique({
    where: { id: seriesId },
    select: { userId: true },
  });

  if (!series) return NextResponse.json({ error: "Series not found." }, { status: 404 });
  if (series.userId !== user.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const parsed = await parseRequestJson(req, postSeriesUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const titleSafe = sanitizePlainText(parsed.data.title.trim()) || "";
  if (!titleSafe) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const updated = await prisma.postSeries.update({
    where: { id: seriesId },
    data: { title: titleSafe.slice(0, 200) },
    select: { id: true, title: true, updatedAt: true },
  });

  return NextResponse.json({ series: updated });
}

// DELETE /api/post-series/[id] — delete a series (posts unattach via SET NULL)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: seriesId } = await params;

  const series = await prisma.postSeries.findUnique({
    where: { id: seriesId },
    select: { userId: true },
  });

  if (!series) return NextResponse.json({ error: "Series not found." }, { status: 404 });
  if (series.userId !== user.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.post.updateMany({
      where: { seriesId },
      data: { seriesId: null, seriesPosition: null },
    }),
    prisma.postSeries.delete({ where: { id: seriesId } }),
  ]);

  return NextResponse.json({ message: "Album deleted." });
}
