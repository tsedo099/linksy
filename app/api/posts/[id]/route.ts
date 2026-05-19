import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { formatPollForViewer } from "@/lib/polls";
import {
  cacheGetJson,
  cacheSetJson,
  ENTITY_CACHE_TTL,
  invalidatePostDetailViewer,
  postDetailCacheKey,
} from "@/lib/entity-cache";
import { withPostViewerFields } from "@/lib/post-viewer";
import { withCoAuthors, POST_COLLABORATORS_INCLUDE } from "@/lib/post-collaborators";
import { approvedCommentsOnlyCount, commentThreadWhere } from "@/lib/post-comment-moderation";

// GET /api/posts/[id] - single post with comments
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  type PostDetailBody = {
    post: Record<string, unknown>;
  };
  const blockedIds = await getBlockedUserIds(user.userId);

  const peek = await prisma.post.findUnique({ where: { id }, select: { authorId: true } });
  if (!peek) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (blockedIds.includes(peek.authorId)) {
    return NextResponse.json({ error: "Post unavailable." }, { status: 403 });
  }

  const cacheKey = postDetailCacheKey(user.userId, id);
  const cached = await cacheGetJson<PostDetailBody>(cacheKey);
  if (cached?.post) {
    return NextResponse.json({
      post: withPostViewerFields(cached.post as Parameters<typeof withPostViewerFields>[0], user.userId),
    });
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      ...POST_COLLABORATORS_INCLUDE,
      series: { select: { id: true, title: true } },
      _count: {
        select: {
          likes: true,
          ...approvedCommentsOnlyCount,
        },
      },
      likes: { where: { userId: user.userId }, select: { userId: true } },
      saved: { where: { userId: user.userId }, select: { userId: true } },
      comments: {
        where: commentThreadWhere(user.userId, peek.authorId, blockedIds),
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      },
      poll: {
        include: {
          votes: { select: { userId: true, optionIndex: true } },
        },
      },
    },
  });

  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const body = {
    post: withPostViewerFields(withCoAuthors({
      ...post,
      likedByMe: post.likes.length > 0,
      savedByMe: post.saved.length > 0,
      poll: formatPollForViewer(post.poll, user.userId),
      likes: undefined,
      saved: undefined,
    }), user.userId),
  };
  await cacheSetJson(cacheKey, body, ENTITY_CACHE_TTL.postDetail());
  return NextResponse.json(body);
}

// DELETE /api/posts/[id] - delete your own post
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;

  const post = await prisma.post.findUnique({ where: { id }, select: { authorId: true } });

  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (post.authorId !== user.userId) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  await prisma.post.delete({ where: { id } });
  await invalidatePostDetailViewer(user.userId, id);

  return NextResponse.json({ message: "Post deleted." });
}
