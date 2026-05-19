import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { grantXP } from "@/lib/services/xp.service";
import { areUsersBlocked } from "@/lib/user-blocks";
import { createNotificationIfAllowed } from "@/lib/notifications";
import { logBackgroundError } from "@/lib/logger";
import { invalidatePostDetailViewer } from "@/lib/entity-cache";

// POST /api/posts/[id]/like - toggle like
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: postId } = await params;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true },
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const existing = await prisma.like.findUnique({
    where: { userId_postId: { userId: user.userId, postId } },
  });

  if (existing) {
    await prisma.like.delete({ where: { userId_postId: { userId: user.userId, postId } } });
    const count = await prisma.like.count({ where: { postId } });
    await invalidatePostDetailViewer(user.userId, postId);
    if (post.authorId !== user.userId) {
      await invalidatePostDetailViewer(post.authorId, postId);
    }
    return NextResponse.json({ liked: false, count });
  }

  if (post.authorId !== user.userId && await areUsersBlocked(user.userId, post.authorId)) {
    return NextResponse.json({ error: "Post unavailable." }, { status: 403 });
  }

  await prisma.like.create({ data: { userId: user.userId, postId } });
  if (post.authorId !== user.userId) {
    await createNotificationIfAllowed({
      userId: post.authorId,
      fromId: user.userId,
      type: "like",
      postId,
    }).catch(logBackgroundError("notifications.like"));
  }

  if (post.authorId !== user.userId) {
    // grant XP to post author (non-blocking)
    grantXP({
      userId:  post.authorId,
      action:  "LIKE_RECEIVED",
      actorId: user.userId,
      postId,
    }).catch(logBackgroundError("xp.grant.LIKE_RECEIVED"));
  }

  const count = await prisma.like.count({ where: { postId } });
  await invalidatePostDetailViewer(user.userId, postId);
  if (post.authorId !== user.userId) {
    await invalidatePostDetailViewer(post.authorId, postId);
  }
  return NextResponse.json({ liked: true, count });
}
