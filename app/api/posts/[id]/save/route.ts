import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { invalidatePostDetailViewer } from "@/lib/entity-cache";

// POST /api/posts/[id]/save - toggle save
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: postId } = await params;

  const existing = await prisma.savedPost.findUnique({
    where: { userId_postId: { userId: user.userId, postId } },
  });

  if (existing) {
    await prisma.savedPost.delete({ where: { userId_postId: { userId: user.userId, postId } } });
    await invalidatePostDetailViewer(user.userId, postId);
    return NextResponse.json({ saved: false });
  }

  await prisma.savedPost.create({ data: { userId: user.userId, postId } });
  await invalidatePostDetailViewer(user.userId, postId);
  return NextResponse.json({ saved: true });
}
