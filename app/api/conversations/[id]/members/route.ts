import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { parseRequestJson } from "@/lib/request-json";
import { z } from "zod";
import { userNotPendingHardDelete } from "@/lib/user-not-pending-deletion";
import { publishInboxUpdate } from "@/lib/user-inbox-bus";

const addMembersSchema = z.object({
  userIds: z.array(z.string()).min(1).max(20),
});

const GROUP_MEMBER_LIMIT = 50;

/**
 * POST /api/conversations/[id]/members
 * Group-chat admin invites additional members.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId } = await params;
  const parsed = await parseRequestJson(req, addMembersSchema);
  if (!parsed.ok) return parsed.response;

  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      isGroup: true,
      members: { select: { userId: true, role: true } },
    },
  });
  if (!convo) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  if (!convo.isGroup) return NextResponse.json({ error: "Only group chats can add members." }, { status: 400 });

  const myMember = convo.members.find((m) => m.userId === me.userId);
  if (!myMember) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (myMember.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can add members." }, { status: 403 });
  }

  const existing = new Set(convo.members.map((m) => m.userId));
  const requested = Array.from(new Set(parsed.data.userIds.filter((id) => id !== me.userId && !existing.has(id))));
  if (requested.length === 0) {
    return NextResponse.json({ error: "All selected users are already in the group." }, { status: 400 });
  }
  if (convo.members.length + requested.length > GROUP_MEMBER_LIMIT) {
    return NextResponse.json({ error: `Group is limited to ${GROUP_MEMBER_LIMIT} members.` }, { status: 400 });
  }

  const blocked = new Set(await getBlockedUserIds(me.userId));
  if (requested.some((id) => blocked.has(id))) {
    return NextResponse.json({ error: "You cannot invite blocked users." }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { id: { in: requested }, ...userNotPendingHardDelete },
    select: { id: true, allowGroupInvites: true },
  });
  if (users.length !== requested.length) {
    return NextResponse.json({ error: "One or more users could not be found." }, { status: 400 });
  }
  if (users.some((u) => !u.allowGroupInvites)) {
    return NextResponse.json({ error: "One or more users do not allow group invites." }, { status: 403 });
  }

  await prisma.conversationMember.createMany({
    data: requested.map((userId) => ({ userId, conversationId, role: "MEMBER" as const })),
    skipDuplicates: true,
  });

  publishInboxUpdate(
    [...convo.members.map((m) => m.userId), ...requested],
    conversationId,
    "update",
  );

  return NextResponse.json({ added: requested });
}
