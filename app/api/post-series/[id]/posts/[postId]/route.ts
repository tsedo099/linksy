import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

// DELETE /api/post-series/[id]/posts/[postId] — detach a post from this album
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; postId: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: seriesId, postId } = await params;

  const series = await prisma.postSeries.findUnique({
    where: { id: seriesId },
    select: { userId: true },
  });

  if (!series) return NextResponse.json({ error: "Series not found." }, { status: 404 });
  if (series.userId !== user.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { seriesId: true, authorId: true },
  });

  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (post.seriesId !== seriesId) {
    return NextResponse.json({ error: "Post is not in this album." }, { status: 400 });
  }
  if (post.authorId !== user.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await prisma.post.update({
    where: { id: postId },
    data: { seriesId: null, seriesPosition: null },
  });

  return NextResponse.json({ message: "Post removed from album." });
}
