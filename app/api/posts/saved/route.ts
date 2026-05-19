import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { approvedCommentsOnlyCount } from "@/lib/post-comment-moderation";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const blockedIds = await getBlockedUserIds(user.userId);

  const saved = await prisma.savedPost.findMany({
    where: {
      userId: user.userId,
      post: { authorId: { notIn: blockedIds } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      post: {
        include: {
          author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          _count: { select: { likes: true, ...approvedCommentsOnlyCount } },
        },
      },
    },
  });

  return NextResponse.json({
    posts: saved.map((item) => ({
      id: item.post.id,
      imageUrl: item.post.mediaUrls[0] ?? null,
      caption: item.post.caption,
      createdAt: item.post.createdAt,
      savedAt: item.createdAt,
      user: item.post.author,
      _count: item.post._count,
    })),
  });
}
