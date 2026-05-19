import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

/** GET /api/posts/[id]/analytics — post owner only: views and engagement breakdown. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: postId } = await params;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true },
  });
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (post.authorId !== me.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const [views, saves, reposts, likes, comments] = await Promise.all([
    prisma.postView.count({ where: { postId } }),
    prisma.savedPost.count({ where: { postId } }),
    prisma.repost.count({ where: { postId } }),
    prisma.like.count({ where: { postId } }),
    prisma.comment.count({ where: { postId } }),
  ]);

  const engagementTotal = likes + comments + saves + reposts;

  return NextResponse.json({
    analytics: {
      views,
      likes,
      comments,
      saves,
      reposts,
      engagementTotal,
    },
  });
}
