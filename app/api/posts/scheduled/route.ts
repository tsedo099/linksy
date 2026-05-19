import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

/**
 * GET  /api/posts/scheduled — list the caller's own posts whose `scheduledAt`
 *                              is still in the future (i.e. not yet published).
 *
 * Authors can use the canonical `DELETE /api/posts/[id]` to cancel a scheduled
 * post; rescheduling = delete + repost (kept simple to avoid a separate
 * editor flow).
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const now = new Date();
  const posts = await prisma.post.findMany({
    where: {
      authorId: me.userId,
      scheduledAt: { gt: now },
    },
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      mediaUrls: true,
      caption: true,
      location: true,
      audience: true,
      category: true,
      scheduledAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    posts: posts.map((post) => ({
      ...post,
      scheduledAt: post.scheduledAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
    })),
  });
}
