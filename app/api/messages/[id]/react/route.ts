import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { Prisma } from "@/lib/generated/prisma/client";
import { parseRequestJson } from "@/lib/request-json";
import { messageReactSchema } from "@/lib/schemas/api-bodies";
import { publishConversationMessageActivity } from "@/lib/conversation-message-bus";

const MAX_EMOJI_LENGTH = 20;

function isMissingMessageDeletedAt(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return String(error.meta?.column ?? error.message ?? "").includes("deletedAt");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("deletedAt");
}

function normalizeEmoji(value: unknown) {
  if (typeof value !== "string") return null;
  const emoji = value.trim();
  if (!emoji) return null;
  if (emoji.length > MAX_EMOJI_LENGTH) return null;
  return emoji;
}

// POST /api/messages/[id]/react - toggle or update my reaction
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: messageId } = await params;
  const parsed = await parseRequestJson(req, messageReactSchema);
  if (!parsed.ok) return parsed.response;
  const emoji = normalizeEmoji(parsed.data.emoji);
  if (!emoji) {
    return NextResponse.json({ error: "Valid emoji is required." }, { status: 400 });
  }

  let message: { id: string; conversationId: string; deletedAt?: Date | null } | null;
  try {
    message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, deletedAt: true },
    });
  } catch (error) {
    if (!isMissingMessageDeletedAt(error)) throw error;
    message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true },
    });
  }
  if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  if (message.deletedAt) {
    return NextResponse.json({ error: "Cannot react to a deleted message." }, { status: 410 });
  }

  const member = await prisma.conversationMember.findUnique({
    where: {
      userId_conversationId: {
        userId: me.userId,
        conversationId: message.conversationId,
      },
    },
    select: { isRequest: true },
  });
  if (!member) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (member.isRequest) {
    return NextResponse.json({ error: "Accept the message request first." }, { status: 403 });
  }

  const blockedIds = await getBlockedUserIds(me.userId);
  if (blockedIds.length > 0) {
    const blockedMember = await prisma.conversationMember.findFirst({
      where: {
        conversationId: message.conversationId,
        userId: { in: blockedIds },
      },
      select: { userId: true },
    });
    if (blockedMember) {
      return NextResponse.json({ error: "Conversation unavailable." }, { status: 403 });
    }
  }

  const existing = await prisma.messageReaction.findFirst({
    where: { messageId, userId: me.userId },
    orderBy: { createdAt: "desc" },
  });

  let reacted: boolean;
  if (existing?.emoji === emoji) {
    await prisma.messageReaction.deleteMany({
      where: { messageId, userId: me.userId, emoji },
    });
    reacted = false;
  } else if (existing) {
    await prisma.messageReaction.deleteMany({
      where: { messageId, userId: me.userId },
    });
    await prisma.messageReaction.create({ data: { messageId, userId: me.userId, emoji } });
    reacted = true;
  } else {
    await prisma.messageReaction.create({
      data: { messageId, userId: me.userId, emoji },
    });
    reacted = true;
  }

  const reactions = await prisma.messageReaction.findMany({
    where: { messageId },
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  publishConversationMessageActivity(message.conversationId, "react");

  return NextResponse.json({
    reacted,
    messageId,
    reactions: reactions.map((reaction) => ({
      emoji: reaction.emoji,
      user: reaction.user,
      createdAt: reaction.createdAt,
    })),
  });
}
