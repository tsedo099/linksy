import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser, getCachedUserDisplayProfile } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { getTypingBus } from "@/lib/typing-bus";
import { parseRequestJsonAllowEmpty } from "@/lib/request-json";
import { typingSchema } from "@/lib/schemas/api-bodies";

const TYPING_TTL_MS = 8000;

// GET /api/conversations/[id]/typing - list peers currently typing (excluding self).
// Polled by the chat composer every ~1.5s. We intentionally do not open an SSE
// here because /messages already runs near the HTTP/1.1 6-connection cap; adding
// another stream starves the POST /api/messages send. DB is the source of truth
// (also written by POST), so this works across server restarts / multi-instance.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId } = await params;
  const now = new Date();

  // Polled every ~3.5s — fire the 3 independent lookups in parallel so
  // we pay one round trip's latency, not three. The typing rows fetch
  // is the most expensive; running it speculatively is fine because we
  // discard it if membership / block check fails.
  const [member, blockedIds, rows] = await Promise.all([
    prisma.conversationMember.findUnique({
      where: { userId_conversationId: { userId: me.userId, conversationId } },
      select: { isRequest: true },
    }),
    getBlockedUserIds(me.userId),
    prisma.conversationTyping.findMany({
      where: {
        conversationId,
        expiresAt: { gt: now },
        userId: { not: me.userId },
      },
      select: {
        expiresAt: true,
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  if (!member || member.isRequest) {
    return NextResponse.json({ typingUsers: [] });
  }

  // Block-leak guard: if anyone the viewer has blocked is in this convo,
  // refuse to expose their typing status.
  if (blockedIds.length > 0) {
    const blockedMember = await prisma.conversationMember.findFirst({
      where: { conversationId, userId: { in: blockedIds } },
      select: { userId: true },
    });
    if (blockedMember) {
      return NextResponse.json({ typingUsers: [] });
    }
  }

  return NextResponse.json(
    {
      typingUsers: rows.map((row) => ({
        ...row.user,
        expiresAt: row.expiresAt,
      })),
    },
    { headers: { "Cache-Control": "private, max-age=2" } },
  );
}

// POST /api/conversations/[id]/typing - update typing status
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId } = await params;
  const parsed = await parseRequestJsonAllowEmpty(req, typingSchema);
  if (!parsed.ok) return parsed.response;
  const typing = parsed.data.typing !== false;

  const member = await prisma.conversationMember.findUnique({
    where: { userId_conversationId: { userId: me.userId, conversationId } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (member.isRequest) {
    return NextResponse.json({ error: "Accept the message request first." }, { status: 403 });
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

  const now = new Date();
  await prisma.conversationTyping.deleteMany({
    where: {
      conversationId,
      expiresAt: { lte: now },
    },
  });

  let expiresAt: Date;
  if (typing) {
    expiresAt = new Date(now.getTime() + TYPING_TTL_MS);
    await prisma.conversationTyping.upsert({
      where: {
        conversationId_userId: {
          conversationId,
          userId: me.userId,
        },
      },
      create: {
        conversationId,
        userId: me.userId,
        expiresAt,
      },
      update: {
        expiresAt,
      },
    });
  } else {
    expiresAt = now;
    await prisma.conversationTyping.deleteMany({
      where: {
        conversationId,
        userId: me.userId,
      },
    });
  }

  // Use the 60s display-profile cache instead of hitting the DB on every
  // keystroke — the typing POST runs on almost every key the user types.
  const meRow = await getCachedUserDisplayProfile(me.userId);
  if (meRow) {
    await getTypingBus().publish({
      conversationId,
      user: meRow,
      typing,
      expiresAt: expiresAt.toISOString(),
      ts: now.getTime(),
    });
  }

  const typingUsers = await prisma.conversationTyping.findMany({
    where: {
      conversationId,
      expiresAt: { gt: new Date() },
      userId: { not: me.userId },
    },
    select: {
      user: {
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      },
      expiresAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    typing,
    typingUsers: typingUsers.map((entry) => ({
      ...entry.user,
      expiresAt: entry.expiresAt,
    })),
  });
}
