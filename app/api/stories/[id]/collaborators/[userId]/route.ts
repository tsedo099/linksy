import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

/**
 * DELETE /api/stories/[id]/collaborators/[userId]
 *
 * Removes a collaborator from a story. Authorized either as:
 *   - the story author (kicking the collaborator), or
 *   - the collaborator themselves (leaving the collab).
 *
 * No-op (200) if the row does not exist, so the client can fire-and-forget.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: storyId, userId: targetUserId } = await params;

  const story = await prisma.story.findUnique({
    where: { id: storyId },
    select: { id: true, authorId: true },
  });
  if (!story) return NextResponse.json({ error: "Story not found." }, { status: 404 });

  const isAuthor = story.authorId === me.userId;
  const isSelfRemoving = targetUserId === me.userId;
  if (!isAuthor && !isSelfRemoving) {
    return NextResponse.json({ error: "Only the author or the collaborator can remove this." }, { status: 403 });
  }

  await prisma.storyCollaborator.deleteMany({
    where: { storyId, userId: targetUserId },
  });

  return NextResponse.json({ ok: true });
}
