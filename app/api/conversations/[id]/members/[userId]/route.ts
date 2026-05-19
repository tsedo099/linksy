import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { publishInboxUpdate } from "@/lib/user-inbox-bus";

/**
 * DELETE /api/conversations/[id]/members/[userId]
 * Group-chat admin removes a member. Admins cannot remove themselves here —
 * use /api/conversations/[id]/leave for that flow.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId, userId: targetUserId } = await params;

  if (targetUserId === me.userId) {
    return NextResponse.json(
      { error: "Use the Leave chat action to remove yourself." },
      { status: 400 },
    );
  }

  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      isGroup: true,
      members: { select: { userId: true, role: true } },
    },
  });
  if (!convo) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  if (!convo.isGroup) return NextResponse.json({ error: "Only group chats support member removal." }, { status: 400 });

  const me_member = convo.members.find((m) => m.userId === me.userId);
  if (!me_member) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (me_member.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can remove members." }, { status: 403 });
  }

  const target = convo.members.find((m) => m.userId === targetUserId);
  if (!target) return NextResponse.json({ error: "Member not found in this conversation." }, { status: 404 });

  await prisma.conversationMember.delete({
    where: { userId_conversationId: { userId: targetUserId, conversationId } },
  });

  publishInboxUpdate(
    convo.members.map((m) => m.userId),
    conversationId,
    "update",
  );

  return NextResponse.json({ removed: targetUserId });
}
