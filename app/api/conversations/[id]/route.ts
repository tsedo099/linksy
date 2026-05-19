import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { Prisma } from "@/lib/generated/prisma/client";
import { publishConversationMessageActivity } from "@/lib/conversation-message-bus";
import { publishInboxUpdate } from "@/lib/user-inbox-bus";
import { sanitizePlainText } from "@/lib/sanitize-html";
import { parseRequestJson } from "@/lib/request-json";
import { adultContentVisibility } from "@/lib/age";
import { z } from "zod";

function isMissingMessageReadAt(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === "P2022"
    && String(error.meta?.modelName ?? "").includes("Message");
}

function isMissingMessageEditDelete(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    const column = String(error.meta?.column ?? error.message ?? "");
    return column.includes("editedAt") || column.includes("deletedAt");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("editedAt") || message.includes("deletedAt");
}

function isMissingMessageReplyTo(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return String(error.meta?.column ?? error.message ?? "").includes("replyToId");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("replyToId") || message.includes("replyTo");
}

const REPLY_PREVIEW_MAX = 140;
function buildReplyPreview(text: string | null | undefined, mediaUrl: string | null | undefined) {
  const trimmed = (text ?? "").trim();
  if (trimmed) return trimmed.slice(0, REPLY_PREVIEW_MAX);
  if (mediaUrl) {
    return /\.(mp4|mov|webm)$/i.test(mediaUrl) ? "Video" : "Photo";
  }
  return "";
}

// GET /api/conversations/[id] - message history
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId } = await params;

  const member = await prisma.conversationMember.findUnique({
    where: { userId_conversationId: { userId: me.userId, conversationId } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const memberWithPin = member as typeof member & { pinnedMessageId?: string | null; isBlocked?: boolean };
  const pinnedMessageId = memberWithPin.pinnedMessageId ?? null;
  const isBlockedByMe = memberWithPin.isBlocked === true;

  // Resolve the viewer's adult-content policy ONCE for the whole batch.
  // Tolerated when columns aren't yet migrated (P2022) — fall back to the
  // "confirm-then-reveal" path, never strip a body without knowing the age.
  let viewerAdultPolicy: "blocked" | "reveal" | "confirm" = "confirm";
  try {
    const viewerPrefs = await prisma.user.findUnique({
      where: { id: me.userId },
      select: { birthDate: true, autoRevealAdultContent: true },
    });
    if (viewerPrefs) {
      viewerAdultPolicy = adultContentVisibility({
        birthDate: viewerPrefs.birthDate,
        autoReveal: viewerPrefs.autoRevealAdultContent,
      });
    }
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2022") {
      throw error;
    }
    // legacy schema → keep default "confirm"
  }

  const blockedIds = await getBlockedUserIds(me.userId);
  if (blockedIds.length > 0) {
    const blockedMember = await prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId: { in: blockedIds },
      },
      select: { userId: true },
    });
    if (blockedMember) {
      return NextResponse.json({ error: "Conversation unavailable." }, { status: 403 });
    }
  }

  const cursor = req.nextUrl.searchParams.get("cursor");

  const replyToInclude = {
    select: {
      id: true,
      text: true,
      mediaUrl: true,
      sender: { select: { displayName: true } },
    },
  } as const;

  let messages;
  let replyToAvailable = true;
  try {
    messages = await prisma.message.findMany({
      where: {
        conversationId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      take: 31,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        reactions: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        replyTo: replyToInclude,
      },
    });
  } catch (error) {
    if (isMissingMessageReplyTo(error)) {
      replyToAvailable = false;
      try {
        messages = await prisma.message.findMany({
          where: { conversationId },
          orderBy: { createdAt: "desc" },
          take: 31,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          include: {
            sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            reactions: {
              include: {
                user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        });
      } catch (innerError) {
        if (!isMissingMessageReadAt(innerError) && !isMissingMessageEditDelete(innerError)) throw innerError;
        messages = await prisma.message.findMany({
          where: { conversationId },
          orderBy: { createdAt: "desc" },
          take: 31,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: {
            id: true,
            senderId: true,
            conversationId: true,
            text: true,
            mediaUrl: true,
            read: true,
            createdAt: true,
            sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            reactions: {
              include: {
                user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        });
      }
    } else if (!isMissingMessageReadAt(error) && !isMissingMessageEditDelete(error)) {
      throw error;
    } else {
      replyToAvailable = false;
      messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take: 31,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          senderId: true,
          conversationId: true,
          text: true,
          mediaUrl: true,
          read: true,
          createdAt: true,
          sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          reactions: {
            include: {
              user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }
  }
  void replyToAvailable;

  // Mark unread messages as read.
  const readAt = new Date();
  let markedReadCount = 0;
  try {
    const result = await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: me.userId },
        OR: [{ read: false }, { readAt: null }],
      },
      data: { read: true, readAt },
    });
    markedReadCount = result.count;
  } catch (error) {
    if (!isMissingMessageReadAt(error)) throw error;
    const result = await prisma.message.updateMany({
      where: { conversationId, senderId: { not: me.userId }, read: false },
      data: { read: true },
    });
    markedReadCount = result.count;
  }

  // Notify the sender's open SSE listener so the "Read" tick flips instantly
  // — only when we actually flipped at least one row.
  if (markedReadCount > 0) {
    publishConversationMessageActivity(conversationId, "read");
  }

  // Stamp expiresAt for AFTER_READ messages whose timer just started. We use a
  // raw UPDATE so we can compute expiresAt from per-row expireAfterSeconds in
  // a single round-trip. Tolerated as a no-op if columns aren't migrated.
  try {
    await prisma.$executeRaw`
      UPDATE "Message"
      SET "expiresAt" = ${readAt} + ("expireAfterSeconds" || ' seconds')::interval
      WHERE "conversationId" = ${conversationId}
        AND "senderId" <> ${me.userId}
        AND "expirePolicy" = 'AFTER_READ'
        AND "expireAfterSeconds" IS NOT NULL
        AND "expiresAt" IS NULL
    `;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (
      !msg.includes("expirePolicy")
      && !msg.includes("expiresAt")
      && !(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022")
    ) throw error;
  }

  const hasMore = messages.length > 30;
  const items = hasMore ? messages.slice(0, 30) : messages;
  const now = new Date();
  await prisma.conversationTyping.deleteMany({
    where: {
      conversationId,
      expiresAt: { lte: now },
    },
  });
  const typingUsers = await prisma.conversationTyping.findMany({
    where: {
      conversationId,
      expiresAt: { gt: now },
      userId: { not: me.userId },
    },
    select: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      expiresAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    messages: items.reverse().map((message) => {
      const m = message as typeof message & {
        editedAt?: Date | null;
        deletedAt?: Date | null;
        containsAdultContent?: boolean | null;
        replyTo?: { id: string; text: string; mediaUrl: string | null; sender: { displayName: string } } | null;
      };
      // Per-message adult gate: a viewer aged <18 never receives the body of
      // an adult-flagged message. Sender always sees their own messages — we
      // never redact when `senderId === me.userId`.
      const adultFlag = m.containsAdultContent === true;
      const isOwnMessage = m.senderId === me.userId;
      const blockBody = adultFlag && !isOwnMessage && viewerAdultPolicy === "blocked";
      const replyTo = m.replyTo
        ? {
            messageId: m.replyTo.id,
            senderName: m.replyTo.sender.displayName,
            preview: buildReplyPreview(m.replyTo.text, m.replyTo.mediaUrl),
          }
        : null;
      return {
        ...message,
        ...(blockBody ? { text: "", mediaUrl: null } : {}),
        editedAt: m.editedAt ?? null,
        deletedAt: m.deletedAt ?? null,
        containsAdultContent: adultFlag,
        adultContentRedacted: blockBody,
        replyTo: blockBody ? null : replyTo,
        reactions: message.reactions.map((reaction) => ({
          emoji: reaction.emoji,
          user: reaction.user,
          createdAt: reaction.createdAt,
        })),
      };
    }),
    typingUsers: typingUsers.map((entry) => ({
      ...entry.user,
      expiresAt: entry.expiresAt,
    })),
    pinnedMessageId,
    isBlockedByMe,
    nextCursor: hasMore ? items[0]?.id ?? null : null,
  });
}

const conversationPatchSchema = z.object({
  name: z.string().max(80).optional(),
});

// PATCH /api/conversations/[id] - admin renames a group chat
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId } = await params;
  const parsed = await parseRequestJson(req, conversationPatchSchema);
  if (!parsed.ok) return parsed.response;

  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, isGroup: true, members: { select: { userId: true, role: true } } },
  });
  if (!convo) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  if (!convo.isGroup) return NextResponse.json({ error: "Only group chats can be renamed." }, { status: 400 });

  const myMember = convo.members.find((m) => m.userId === me.userId);
  if (!myMember) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (myMember.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can change the group name." }, { status: 403 });
  }

  if (parsed.data.name === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const rawName = parsed.data.name.trim();
  const safeName = rawName ? sanitizePlainText(rawName).trim() : "";
  if (!safeName) {
    return NextResponse.json({ error: "Group name cannot be empty." }, { status: 400 });
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { name: safeName },
    select: { id: true, name: true },
  });

  publishInboxUpdate(convo.members.map((m) => m.userId), conversationId, "update");
  return NextResponse.json({ conversation: updated });
}

// DELETE /api/conversations/[id] - leave (or remove) a conversation for current user
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId } = await params;

  const member = await prisma.conversationMember.findUnique({
    where: { userId_conversationId: { userId: me.userId, conversationId } },
    select: { userId: true },
  });
  if (!member) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  await prisma.conversationMember.delete({
    where: { userId_conversationId: { userId: me.userId, conversationId } },
  });

  const remaining = await prisma.conversationMember.count({
    where: { conversationId },
  });

  if (remaining === 0) {
    await prisma.conversation.delete({ where: { id: conversationId } });
  }

  return NextResponse.json({ deleted: true });
}
