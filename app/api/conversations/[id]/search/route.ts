import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { Prisma } from "@/lib/generated/prisma/client";

const MAX_QUERY_LENGTH = 120;
const PAGE_SIZE = 30;
const SNIPPET_RADIUS = 40;

function isMissingDeletedAt(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return String(error.meta?.column ?? error.message ?? "").includes("deletedAt");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("deletedAt");
}

function buildSnippet(text: string, query: string) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + query.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end) + suffix;
}

// GET /api/conversations/[id]/search?q=... - search message text within a conversation
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId } = await params;
  const rawQuery = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!rawQuery) {
    return NextResponse.json({ query: "", results: [] });
  }
  const query = rawQuery.slice(0, MAX_QUERY_LENGTH);

  const cursorParam = req.nextUrl.searchParams.get("cursor");
  const cursor = cursorParam ?? undefined;

  const member = await prisma.conversationMember.findUnique({
    where: { userId_conversationId: { userId: me.userId, conversationId } },
    select: { isRequest: true },
  });
  if (!member) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (member.isRequest) {
    return NextResponse.json({ error: "Accept the message request first." }, { status: 403 });
  }

  const blockedIds = await getBlockedUserIds(me.userId);
  if (blockedIds.length > 0) {
    const blockedMember = await prisma.conversationMember.findFirst({
      where: { conversationId, userId: { in: blockedIds } },
      select: { userId: true },
    });
    if (blockedMember) {
      return NextResponse.json({ error: "Conversation unavailable." }, { status: 403 });
    }
  }

  const baseWhere = {
    conversationId,
    text: { contains: query, mode: "insensitive" as const },
  };

  let messages;
  try {
    messages = await prisma.message.findMany({
      where: { ...baseWhere, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        text: true,
        createdAt: true,
        senderId: true,
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
  } catch (error) {
    if (!isMissingDeletedAt(error)) throw error;
    messages = await prisma.message.findMany({
      where: baseWhere,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        text: true,
        createdAt: true,
        senderId: true,
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  const hasMore = messages.length > PAGE_SIZE;
  const items = hasMore ? messages.slice(0, PAGE_SIZE) : messages;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

  return NextResponse.json({
    query,
    results: items.map((message) => ({
      id: message.id,
      text: message.text,
      snippet: buildSnippet(message.text ?? "", query),
      createdAt: message.createdAt,
      sender: message.sender,
    })),
    nextCursor,
  });
}
