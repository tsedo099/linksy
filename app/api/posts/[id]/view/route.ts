import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { areUsersBlocked, getBlockedUserIds } from "@/lib/user-blocks";
import { publishedPostWhere } from "@/lib/post-schedule";

/** POST /api/posts/[id]/view — record a unique viewer (not counted for the post author). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: postId } = await params;
  const now = new Date();

  const post = await prisma.post.findFirst({
    where: { id: postId, AND: [publishedPostWhere(now)] },
    select: { id: true, authorId: true, audience: true },
  });
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  if (post.authorId === me.userId) {
    return NextResponse.json({ recorded: false, reason: "author" });
  }

  if (await areUsersBlocked(me.userId, post.authorId)) {
    return NextResponse.json({ error: "Post unavailable." }, { status: 403 });
  }

  const blockedIds = await getBlockedUserIds(me.userId);
  if (blockedIds.includes(post.authorId)) {
    return NextResponse.json({ error: "Post unavailable." }, { status: 403 });
  }

  // Audience: only friends / close circle need membership checks
  if (post.audience === "FRIENDS") {
    const iFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: me.userId, followingId: post.authorId },
      },
    });
    if (!iFollow) {
      return NextResponse.json({ error: "Post unavailable." }, { status: 403 });
    }
  } else if (post.audience === "CLOSE_CIRCLE") {
    const member = await prisma.closeCircle.findUnique({
      where: {
        userId_targetId: { userId: post.authorId, targetId: me.userId },
      },
    });
    if (!member) {
      return NextResponse.json({ error: "Post unavailable." }, { status: 403 });
    }
  }

  await prisma.postView.upsert({
    where: { userId_postId: { userId: me.userId, postId } },
    create: { userId: me.userId, postId },
    update: { viewedAt: new Date() },
  });

  return NextResponse.json({ recorded: true });
}
