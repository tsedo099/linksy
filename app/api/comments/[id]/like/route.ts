import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

// POST /api/comments/[id]/like - toggle comment like
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: commentId } = await params;

  const existing = await prisma.commentLike.findUnique({
    where: { userId_commentId: { userId: me.userId, commentId } },
  });

  if (existing) {
    await prisma.commentLike.delete({
      where: { userId_commentId: { userId: me.userId, commentId } },
    });
    const count = await prisma.commentLike.count({ where: { commentId } });
    return NextResponse.json({ liked: false, count });
  }

  await prisma.commentLike.create({ data: { userId: me.userId, commentId } });
  const count = await prisma.commentLike.count({ where: { commentId } });
  return NextResponse.json({ liked: true, count });
}
