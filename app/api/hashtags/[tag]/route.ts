import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { publishedPostWhere } from "@/lib/post-schedule";
import { approvedCommentsOnlyCount } from "@/lib/post-comment-moderation";

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tag: string }> },
) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { tag } = await params;
  const normalizedTag = decodeURIComponent(tag).trim().replace(/^#/, "");
  if (!normalizedTag) return NextResponse.json({ tag: "", posts: [] });

  const blockedIds = await getBlockedUserIds(me.userId);
  const posts = await prisma.post.findMany({
    where: {
      AND: [
        {
          authorId: { notIn: blockedIds },
          caption: { contains: `#${normalizedTag}`, mode: "insensitive" },
        },
        publishedPostWhere(),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      author: { select: AUTHOR_SELECT },
      _count: { select: { likes: true, ...approvedCommentsOnlyCount } },
      likes: { where: { userId: me.userId }, select: { userId: true } },
      saved: { where: { userId: me.userId }, select: { userId: true } },
    },
  });

  return NextResponse.json({
    tag: normalizedTag,
    posts: posts.map((post) => ({
      ...post,
      likedByMe: post.likes.length > 0,
      savedByMe: post.saved.length > 0,
      likes: undefined,
      saved: undefined,
    })),
  });
}
