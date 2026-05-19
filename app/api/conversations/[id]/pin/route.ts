import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { Prisma } from "@/lib/generated/prisma/client";
import { parseRequestJsonAllowEmpty } from "@/lib/request-json";
import { conversationPinSchema } from "@/lib/schemas/api-bodies";
import { publishConversationMessageActivity } from "@/lib/conversation-message-bus";

function isMissingPinnedColumn(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return String(error.meta?.column ?? error.message ?? "").includes("pinnedMessageId");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("pinnedMessageId");
}

// POST /api/conversations/[id]/pin - pin/unpin a message for the current member
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId } = await params;
  const parsed = await parseRequestJsonAllowEmpty(req, conversationPinSchema);
  if (!parsed.ok) return parsed.response;
  const rawId = typeof parsed.data.messageId === "string" ? parsed.data.messageId.trim() : "";
  const messageId: string | null = rawId.length > 0 ? rawId : null;

  const member = await prisma.conversationMember.findUnique({
    where: { userId_conversationId: { userId: me.userId, conversationId } },
    select: { userId: true, isRequest: true },
  });
  if (!member) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (member.isRequest) {
    return NextResponse.json({ error: "Accept the message request first." }, { status: 403 });
  }

  if (messageId) {
    const target = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, deletedAt: true },
    });
    if (!target || target.conversationId !== conversationId) {
      return NextResponse.json({ error: "Message not found in this conversation." }, { status: 404 });
    }
    if (target.deletedAt) {
      return NextResponse.json({ error: "Cannot pin a deleted message." }, { status: 410 });
    }
  }

  try {
    await prisma.conversationMember.update({
      where: { userId_conversationId: { userId: me.userId, conversationId } },
      data: { pinnedMessageId: messageId },
    });
  } catch (error) {
    if (isMissingPinnedColumn(error)) {
      return NextResponse.json(
        { error: "Pinned messages are temporarily unavailable. Please retry once the database migration is applied." },
        { status: 503 },
      );
    }
    throw error;
  }

  publishConversationMessageActivity(conversationId, "pin");

  return NextResponse.json({ pinnedMessageId: messageId });
}
