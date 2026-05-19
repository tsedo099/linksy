import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { Prisma } from "@/lib/generated/prisma/client";
import { parseRequestJson } from "@/lib/request-json";
import { memberRoleSchema } from "@/lib/schemas/api-bodies";

const ALLOWED_ROLES = new Set(["MEMBER", "ADMIN"]);

function isMissingRoleColumn(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return String(error.meta?.column ?? error.message ?? "").includes("role");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("ConversationRole") || message.includes("Unknown field `role`") || message.includes("Unknown argument `role`");
}

// POST /api/conversations/[id]/members/[userId]/role - admin promotes/demotes a group member
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId, userId: targetUserId } = await params;
  const parsed = await parseRequestJson(req, memberRoleSchema);
  if (!parsed.ok) return parsed.response;
  const requestedRole = parsed.data.role.toUpperCase();
  if (!ALLOWED_ROLES.has(requestedRole)) {
    return NextResponse.json({ error: "Role must be MEMBER or ADMIN." }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, isGroup: true },
  });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  if (!conversation.isGroup) {
    return NextResponse.json({ error: "Roles only apply to group conversations." }, { status: 400 });
  }

  let myMember;
  try {
    myMember = await prisma.conversationMember.findUnique({
      where: { userId_conversationId: { userId: me.userId, conversationId } },
      select: { role: true, isRequest: true },
    });
  } catch (error) {
    if (isMissingRoleColumn(error)) {
      return NextResponse.json(
        { error: "Group roles are temporarily unavailable. Please retry once the database migration is applied." },
        { status: 503 },
      );
    }
    throw error;
  }
  if (!myMember) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (myMember.isRequest) return NextResponse.json({ error: "Accept the message request first." }, { status: 403 });
  if (myMember.role !== "ADMIN") {
    return NextResponse.json({ error: "Only admins can change member roles." }, { status: 403 });
  }

  if (targetUserId === me.userId && requestedRole === "MEMBER") {
    const otherAdminCount = await prisma.conversationMember.count({
      where: { conversationId, role: "ADMIN", userId: { not: me.userId } },
    });
    if (otherAdminCount === 0) {
      return NextResponse.json({ error: "Promote another admin before stepping down." }, { status: 400 });
    }
  }

  const target = await prisma.conversationMember.findUnique({
    where: { userId_conversationId: { userId: targetUserId, conversationId } },
    select: { userId: true },
  });
  if (!target) return NextResponse.json({ error: "Member not found in this conversation." }, { status: 404 });

  try {
    await prisma.conversationMember.update({
      where: { userId_conversationId: { userId: targetUserId, conversationId } },
      data: { role: requestedRole as "MEMBER" | "ADMIN" },
    });
  } catch (error) {
    if (isMissingRoleColumn(error)) {
      return NextResponse.json(
        { error: "Group roles are temporarily unavailable. Please retry once the database migration is applied." },
        { status: 503 },
      );
    }
    throw error;
  }

  return NextResponse.json({ userId: targetUserId, role: requestedRole });
}
