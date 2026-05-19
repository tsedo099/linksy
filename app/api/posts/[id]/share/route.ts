import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { areUsersBlocked } from "@/lib/user-blocks";
import { invalidatePostDetailViewer } from "@/lib/entity-cache";
import { parseRequestJsonAllowEmpty } from "@/lib/request-json";
import { postShareSchema } from "@/lib/schemas/api-bodies";
import { sanitizePlainText } from "@/lib/sanitize-html";

/**
 * POST `/api/posts/[id]/share` — Twitter-style internal repost.
 *
 * Idempotent: a second POST from the same viewer updates the comment if
 * provided, otherwise leaves the existing repost untouched. Use DELETE to
 * un-share. Friends-only / close-circle posts can only be shared by viewers
 * already in the audience (callers should pre-check; we still gate via the
 * standard block check here).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: postId } = await params;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, audience: true },
  });
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  if (post.authorId !== user.userId && (await areUsersBlocked(user.userId, post.authorId))) {
    return NextResponse.json({ error: "Post unavailable." }, { status: 403 });
  }

  // Friends / close-circle posts must not leak via repost.
  if (post.audience !== "PUBLIC" && post.authorId !== user.userId) {
    return NextResponse.json({ error: "This post cannot be shared." }, { status: 403 });
  }

  const parsed = await parseRequestJsonAllowEmpty(req, postShareSchema);
  if (!parsed.ok) return parsed.response;

  const comment = parsed.data.comment ? sanitizePlainText(parsed.data.comment).slice(0, 500) || null : null;

  await prisma.repost.upsert({
    where: { userId_postId: { userId: user.userId, postId } },
    create: { userId: user.userId, postId, comment },
    update: { comment },
  });

  const count = await prisma.repost.count({ where: { postId } });
  await invalidatePostDetailViewer(user.userId, postId);

  return NextResponse.json({ shared: true, count, comment });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: postId } = await params;

  const result = await prisma.repost.deleteMany({
    where: { userId: user.userId, postId },
  });

  const count = await prisma.repost.count({ where: { postId } });
  await invalidatePostDetailViewer(user.userId, postId);

  return NextResponse.json({ shared: false, count, removed: result.count });
}
