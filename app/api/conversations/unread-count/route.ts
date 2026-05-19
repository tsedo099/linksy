import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * GET /api/conversations/unread-count — total unread messages + conversation count.
 *
 * Lightweight endpoint used by the AppShell to show a badge on the Messages
 * tab. Excludes conversations the caller has blocked or has a pending request
 * in.
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const blockedIds = await getBlockedUserIds(me.userId);

  const conversationsWhere: Prisma.ConversationWhereInput = {
    members: { some: { userId: me.userId, isRequest: false } },
    ...(blockedIds.length > 0
      ? { NOT: { members: { some: { userId: { in: blockedIds } } } } }
      : {}),
  };

  const messageWhere: Prisma.MessageWhereInput = {
    conversation: conversationsWhere,
    senderId: { not: me.userId },
    read: false,
  };

  const messagesPromise = prisma.message.count({ where: messageWhere }).catch((error) => {
    // Older DBs without all newer columns — fall back to 0.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022")) throw error;
    return 0;
  });

  const conversationsPromise = prisma.conversation.count({
    where: {
      ...conversationsWhere,
      messages: { some: { senderId: { not: me.userId }, read: false } },
    },
  });

  const [unreadMessages, unreadConversations] = await Promise.all([messagesPromise, conversationsPromise]);

  return NextResponse.json(
    { unreadMessages, unreadConversations },
    {
      // Per-viewer counter — browser-private. 5s of staleness is invisible
      // to the user (the badge updates via SSE anyway); this keeps the
      // polling fallback from hitting the DB on every interval.
      headers: { "Cache-Control": "private, max-age=5" },
    },
  );
}
