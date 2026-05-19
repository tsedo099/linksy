import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { areUsersBlocked, getBlockedUserIds } from "@/lib/user-blocks";
import { Prisma } from "@/lib/generated/prisma/client";
import { parseRequestJsonAllowEmpty } from "@/lib/request-json";
import { conversationCreateSchema } from "@/lib/schemas/api-bodies";
import { sanitizePlainText } from "@/lib/sanitize-html";
import { createNotificationIfAllowed } from "@/lib/notifications";
import { logBackgroundError } from "@/lib/logger";
import { publishInboxUpdate } from "@/lib/user-inbox-bus";
import { userNotPendingHardDelete } from "@/lib/user-not-pending-deletion";

function isPrismaMissingColumn(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022";
}

/** Conversation list without newer scalars (`disappearingMode`, `e2eeEnabled`, …) for old DBs. */
function legacyConversationListSelect(
  messageSelect: Prisma.MessageSelect,
): Prisma.ConversationSelect {
  return {
    id: true,
    isGroup: true,
    name: true,
    updatedAt: true,
    members: {
      select: {
        userId: true,
        conversationId: true,
        isRequest: true,
        pinnedMessageId: true,
        role: true,
        isBlocked: true,
        joinedAt: true,
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    },
    messages: {
      orderBy: { createdAt: "desc" },
      take: 1,
      select: messageSelect,
    },
  };
}

function isMissingMessageMediaUrl(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Unknown field `mediaUrl`") && message.includes("model `Message`");
}

function isMissingMessageDeletedAt(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return String(error.meta?.column ?? error.message ?? "").includes("deletedAt");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("deletedAt");
}

function conversationListRecoverable(error: unknown) {
  return isPrismaMissingColumn(error) || isMissingMessageMediaUrl(error) || isMissingMessageDeletedAt(error);
}

/** Payload shape after any of the GET findMany variants (include + legacy select). */
type ConversationListRow = {
  id: string;
  isGroup: boolean;
  name: string | null;
  updatedAt: Date;
  members: Array<{
    userId: string;
    conversationId: string;
    isRequest: boolean;
    role?: "MEMBER" | "ADMIN";
    user: { id: string; username: string; displayName: string; avatarUrl: string | null };
  }>;
  messages: Array<{
    text: string;
    createdAt: Date;
    senderId: string;
    read: boolean;
    readAt?: Date | null;
    mediaUrl?: string | null;
    deletedAt?: Date | null;
  }>;
};

// GET /api/conversations - conversation list
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const blockedIds = await getBlockedUserIds(me.userId);
  const blockedSet = new Set(blockedIds);

  const whereMember = { members: { some: { userId: me.userId } } } as const;
  const order = { updatedAt: "desc" as const };
  const messageSelectFull = {
    text: true,
    mediaUrl: true,
    createdAt: true,
    senderId: true,
    read: true,
    readAt: true,
    deletedAt: true,
  } satisfies Prisma.MessageSelect;
  const messageSelectLegacy = {
    text: true,
    createdAt: true,
    senderId: true,
    read: true,
  } satisfies Prisma.MessageSelect;

  let rows;
  try {
    rows = await prisma.conversation.findMany({
      where: whereMember,
      orderBy: order,
      include: {
        members: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: messageSelectFull,
        },
      },
    });
  } catch (error) {
    if (!conversationListRecoverable(error)) {
      throw error;
    }

    try {
      rows = await prisma.conversation.findMany({
        where: whereMember,
        orderBy: order,
        include: {
          members: {
            include: {
              user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: messageSelectLegacy,
          },
        },
      });
    } catch (error2) {
      if (!conversationListRecoverable(error2)) {
        throw error2;
      }

      try {
        rows = await prisma.conversation.findMany({
          where: whereMember,
          orderBy: order,
          select: legacyConversationListSelect(messageSelectFull),
        });
      } catch (error3) {
        if (!conversationListRecoverable(error3)) {
          throw error3;
        }

        rows = await prisma.conversation.findMany({
          where: whereMember,
          orderBy: order,
          select: legacyConversationListSelect(messageSelectLegacy),
        });
      }
    }
  }

  // Real unread-message counts per conversation (was previously a 0/1 indicator
  // based only on the latest message — caused the badge to read "1" no matter
  // how many unread messages were stacked up).
  const typedRows = rows as ConversationListRow[];
  const allConvoIds = typedRows.map((c) => c.id);
  const unreadCountByConvo = new Map<string, number>();
  if (allConvoIds.length > 0) {
    try {
      const groups = await prisma.message.groupBy({
        by: ["conversationId"],
        where: {
          conversationId: { in: allConvoIds },
          senderId: { not: me.userId },
          read: false,
        },
        _count: { _all: true },
      });
      for (const g of groups) {
        unreadCountByConvo.set(g.conversationId, g._count._all);
      }
    } catch {
      // Older DB / missing column — fall back to 0/1 derived from lastMessage below.
    }
  }

  const conversations: object[] = [];
  const requests: object[] = [];

  for (const c of typedRows) {
    const myMember = c.members.find(m => m.userId === me.userId);
    if (c.members.some(m => m.userId !== me.userId && blockedSet.has(m.userId))) continue;
    const others = c.members.filter(m => m.userId !== me.userId).map((m) => {
      const role = (m as typeof m & { role?: string }).role ?? "MEMBER";
      return { ...m.user, role };
    });
    const myRole = (myMember as typeof myMember & { role?: string } | undefined)?.role ?? "MEMBER";
    const lastMessage = c.messages[0];
    const aggregateUnread = unreadCountByConvo.get(c.id);
    const unread = aggregateUnread !== undefined
      ? aggregateUnread
      : lastMessage && !("readAt" in lastMessage ? lastMessage.readAt : null) && !lastMessage.read && lastMessage.senderId !== me.userId
        ? 1
        : 0;
    const lastMessagePayload = lastMessage
      ? {
          ...lastMessage,
          deletedAt: ("deletedAt" in lastMessage ? lastMessage.deletedAt : null) ?? null,
        }
      : null;

    const item = {
      id: c.id,
      isGroup: c.isGroup,
      name: c.name ?? null,
      updatedAt: c.updatedAt,
      otherUser: c.isGroup ? null : (others[0] ?? null),
      members: c.isGroup ? others : [],
      lastMessage: lastMessagePayload,
      unread,
      myRole: c.isGroup ? myRole : null,
    };

    if (myMember?.isRequest) {
      requests.push(item);
    } else {
      conversations.push(item);
    }
  }

  return NextResponse.json({ conversations, requests });
}

// POST /api/conversations - start a conversation
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJsonAllowEmpty(req, conversationCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // ── Group chat ──
  if (body.isGroup) {
    const blockedIds = await getBlockedUserIds(me.userId);
    const blockedSet = new Set(blockedIds);
    const userIds = Array.from(new Set((body.userIds ?? []).filter(id => typeof id === "string" && id !== me.userId)));
    if (userIds.some(id => blockedSet.has(id))) {
      return NextResponse.json({ error: "You cannot invite blocked users." }, { status: 403 });
    }
    if (userIds.length < 2) return NextResponse.json({ error: "Select at least 2 people." }, { status: 400 });
    if (userIds.length > 20) return NextResponse.json({ error: "Group chats can have up to 20 invited people." }, { status: 400 });

    const invitees = await prisma.user.findMany({
      where: { id: { in: userIds }, ...userNotPendingHardDelete },
      select: { id: true, allowGroupInvites: true },
    });

    if (invitees.length !== userIds.length) {
      return NextResponse.json({ error: "One or more users could not be found." }, { status: 400 });
    }

    if (invitees.some(user => !user.allowGroupInvites)) {
      return NextResponse.json({ error: "One or more users do not allow group invites." }, { status: 403 });
    }

    const rawName = body.name?.trim();
    const name = rawName ? sanitizePlainText(rawName).trim() : "";

    if (name.length > 80) {
      return NextResponse.json({ error: "Group name must be 80 characters or less." }, { status: 400 });
    }

    let convo;
    try {
      convo = await prisma.conversation.create({
        data: {
          isGroup: true,
          name: name || "Group chat",
          members: {
            create: [
              { userId: me.userId, role: "ADMIN" },
              ...userIds.map(id => ({ userId: id, role: "MEMBER" as const })),
            ],
          },
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("Unknown argument `role`")
        || message.includes("Unknown field `role`")
        || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022" && String(error.meta?.column ?? "").includes("role"))
      ) {
        convo = await prisma.conversation.create({
          data: {
            isGroup: true,
            name: name || "Group chat",
            members: {
              create: [{ userId: me.userId }, ...userIds.map(id => ({ userId: id }))],
            },
          },
        });
      } else {
        throw error;
      }
    }
    publishInboxUpdate([me.userId, ...userIds], convo.id, "create");
    return NextResponse.json({ conversationId: convo.id }, { status: 201 });
  }

  // ── Direct message ──
  const targetUserId = body.targetUserId;
  if (!targetUserId || targetUserId === me.userId) {
    return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: { id: targetUserId, ...userNotPendingHardDelete },
    select: { id: true, allowMessageRequests: true, allowStoryReplies: true },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (body.storyReply && !target.allowStoryReplies) {
    return NextResponse.json({ error: "This user does not allow story replies." }, { status: 403 });
  }

  if (await areUsersBlocked(me.userId, targetUserId)) {
    return NextResponse.json({ error: "You cannot message this user." }, { status: 403 });
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      isGroup: false,
      AND: [
        { members: { some: { userId: me.userId } } },
        { members: { some: { userId: targetUserId } } },
      ],
    },
  });
  if (existing) return NextResponse.json({ conversationId: existing.id });

  // Check if target follows sender — if not, it's a request for the target
  const followsBack = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: targetUserId, followingId: me.userId } },
  });

  if (!followsBack && !target.allowMessageRequests) {
    return NextResponse.json({ error: "This user does not allow message requests." }, { status: 403 });
  }

  const convo = await prisma.conversation.create({
    data: {
      members: {
        create: [
          { userId: me.userId },
          { userId: targetUserId, isRequest: !followsBack },
        ],
      },
    },
  });

  if (!followsBack) {
    createNotificationIfAllowed({
      userId: targetUserId,
      fromId: me.userId,
      type: "message_request",
    }).catch(logBackgroundError("notifications.message_request"));
  }

  publishInboxUpdate([me.userId, targetUserId], convo.id, "create");
  return NextResponse.json({ conversationId: convo.id }, { status: 201 });
}
