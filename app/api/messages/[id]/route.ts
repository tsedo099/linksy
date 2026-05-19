import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { Prisma } from "@/lib/generated/prisma/client";
import { parseRequestJson } from "@/lib/request-json";
import { messageEditSchema } from "@/lib/schemas/api-bodies";
import { sanitizePlainText } from "@/lib/sanitize-html";
import { publishConversationMessageActivity } from "@/lib/conversation-message-bus";

const EDIT_WINDOW_MS = 15 * 60 * 1000;

function isMissingMessageColumn(error: unknown, column: "editedAt" | "deletedAt") {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    const message = String(error.meta?.column ?? error.message ?? "");
    return message.includes(column);
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes(`Unknown argument \`${column}\``) || message.includes(`Unknown field \`${column}\``);
}

// PATCH /api/messages/[id] - edit my message text
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: messageId } = await params;
  const parsed = await parseRequestJson(req, messageEditSchema);
  if (!parsed.ok) return parsed.response;
  const nextText = sanitizePlainText(parsed.data.text);

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, senderId: true, conversationId: true, text: true, createdAt: true },
  });
  if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  if (message.senderId !== me.userId) {
    return NextResponse.json({ error: "You can only edit your own messages." }, { status: 403 });
  }

  let deletedAt: Date | null = null;
  try {
    const existing = await prisma.message.findUnique({
      where: { id: messageId },
      select: { deletedAt: true },
    });
    deletedAt = existing?.deletedAt ?? null;
  } catch (error) {
    if (!isMissingMessageColumn(error, "deletedAt")) throw error;
  }
  if (deletedAt) {
    return NextResponse.json({ error: "Cannot edit a deleted message." }, { status: 410 });
  }

  if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
    return NextResponse.json({ error: "Edit window has expired." }, { status: 403 });
  }

  if (nextText === sanitizePlainText(message.text.trim())) {
    return NextResponse.json({ message: { id: messageId, text: message.text, editedAt: null } });
  }

  const editedAt = new Date();
  let updated;
  try {
    updated = await prisma.message.update({
      where: { id: messageId },
      data: { text: nextText, editedAt },
      select: { id: true, text: true, editedAt: true },
    });
  } catch (error) {
    if (!isMissingMessageColumn(error, "editedAt")) throw error;
    updated = await prisma.message.update({
      where: { id: messageId },
      data: { text: nextText },
      select: { id: true, text: true },
    });
    publishConversationMessageActivity(message.conversationId, "edit");
    return NextResponse.json({ message: { ...updated, editedAt: null } });
  }

  publishConversationMessageActivity(message.conversationId, "edit");
  return NextResponse.json({ message: updated });
}

// DELETE /api/messages/[id] - unsend my message (soft delete)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: messageId } = await params;

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, senderId: true, conversationId: true },
  });
  if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  if (message.senderId !== me.userId) {
    return NextResponse.json({ error: "You can only unsend your own messages." }, { status: 403 });
  }

  const member = await prisma.conversationMember.findUnique({
    where: {
      userId_conversationId: {
        userId: me.userId,
        conversationId: message.conversationId,
      },
    },
    select: { userId: true },
  });
  if (!member) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const deletedAt = new Date();
  try {
    await prisma.$transaction([
      prisma.messageReaction.deleteMany({ where: { messageId } }),
      prisma.message.update({
        where: { id: messageId },
        data: { text: "", mediaUrl: null, deletedAt },
      }),
      prisma.conversation.update({
        where: { id: message.conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
  } catch (error) {
    if (!isMissingMessageColumn(error, "deletedAt")) throw error;
    await prisma.$transaction([
      prisma.messageReaction.deleteMany({ where: { messageId } }),
      prisma.message.delete({ where: { id: messageId } }),
      prisma.conversation.update({
        where: { id: message.conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
    publishConversationMessageActivity(message.conversationId, "delete");
    return NextResponse.json({ deleted: true, messageId, hardDeleted: true });
  }

  publishConversationMessageActivity(message.conversationId, "delete");
  return NextResponse.json({ deleted: true, messageId, deletedAt });
}
