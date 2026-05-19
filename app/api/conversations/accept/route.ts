import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { markMessageRequestNotificationsReadForSender } from "@/lib/notifications";
import { parseRequestJson } from "@/lib/request-json";
import { conversationAcceptSchema } from "@/lib/schemas/api-bodies";

// POST /api/conversations/accept  body: { conversationId }
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, conversationAcceptSchema);
  if (!parsed.ok) return parsed.response;
  const conversationId = parsed.data.conversationId.trim();

  const member = await prisma.conversationMember.findUnique({
    where: { userId_conversationId: { userId: me.userId, conversationId } },
    include: {
      conversation: {
        select: {
          members: { select: { userId: true } },
        },
      },
    },
  });

  if (!member) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const blockedIds = await getBlockedUserIds(me.userId);
  if (member.conversation.members.some(row => row.userId !== me.userId && blockedIds.includes(row.userId))) {
    return NextResponse.json({ error: "Conversation unavailable." }, { status: 403 });
  }

  await prisma.conversationMember.update({
    where: { userId_conversationId: { userId: me.userId, conversationId } },
    data: { isRequest: false },
  });

  const senderUserId = member.conversation.members.find((row) => row.userId !== me.userId)?.userId;
  if (senderUserId) {
    await markMessageRequestNotificationsReadForSender({
      recipientUserId: me.userId,
      senderUserId,
    });
  }

  return NextResponse.json({ ok: true });
}
