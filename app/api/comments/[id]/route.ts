import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

// DELETE /api/comments/[id] - delete your own comment
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;

  const comment = await prisma.comment.findUnique({ where: { id }, select: { authorId: true } });

  if (!comment) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  if (comment.authorId !== me.userId) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  await prisma.comment.delete({ where: { id } });

  return NextResponse.json({ message: "Comment deleted." });
}
