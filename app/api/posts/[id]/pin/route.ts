import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

const MAX_PINS = 3;

// POST /api/posts/[id]/pin - toggle pin on own profile (up to MAX_PINS; syncs legacy User.pinnedPostId)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: postId } = await params;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, authorId: true },
  });

  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (post.authorId !== user.userId) {
    return NextResponse.json({ error: "Only your own post can be pinned." }, { status: 403 });
  }

  const rows = await prisma.pinnedPost.findMany({
    where: { userId: user.userId },
    orderBy: { position: "asc" },
  });

  const already = rows.some((r) => r.postId === postId);
  if (!already && rows.length >= MAX_PINS) {
    return NextResponse.json({ error: `You can pin up to ${MAX_PINS} posts.` }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    if (already) {
      await tx.pinnedPost.delete({
        where: { userId_postId: { userId: user.userId, postId } },
      });
    } else {
      const nextPos = rows.length === 0 ? 0 : Math.max(...rows.map((r) => r.position)) + 1;
      await tx.pinnedPost.create({
        data: { userId: user.userId, postId, position: nextPos },
      });
    }

    const ordered = await tx.pinnedPost.findMany({
      where: { userId: user.userId },
      orderBy: { position: "asc" },
      select: { postId: true },
    });
    const firstId = ordered[0]?.postId ?? null;
    await tx.user.update({
      where: { id: user.userId },
      data: { pinnedPostId: firstId },
    });

    return {
      pinned: !already,
      pinnedPostId: firstId,
      pinnedPostIds: ordered.map((r) => r.postId),
    };
  });

  return NextResponse.json(result);
}
