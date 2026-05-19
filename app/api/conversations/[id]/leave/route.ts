import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { Prisma } from "@/lib/generated/prisma/client";

function isMissingRoleColumn(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return String(error.meta?.column ?? error.message ?? "").includes("role");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("ConversationRole") || message.includes("Unknown field `role`");
}

// DELETE /api/conversations/[id]/leave - leave a group conversation (or remove DM for self)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, isGroup: true },
  });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  let myMember;
  try {
    myMember = await prisma.conversationMember.findUnique({
      where: { userId_conversationId: { userId: me.userId, conversationId } },
      select: { userId: true, role: true },
    });
  } catch (error) {
    if (!isMissingRoleColumn(error)) throw error;
    const fallback = await prisma.conversationMember.findUnique({
      where: { userId_conversationId: { userId: me.userId, conversationId } },
      select: { userId: true },
    });
    myMember = fallback ? { ...fallback, role: "MEMBER" as const } : null;
  }
  if (!myMember) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  if (conversation.isGroup && myMember.role === "ADMIN") {
    const otherAdminCount = await prisma.conversationMember.count({
      where: { conversationId, role: "ADMIN", userId: { not: me.userId } },
    }).catch(() => 0);

    if (otherAdminCount === 0) {
      const successor = await prisma.conversationMember.findFirst({
        where: { conversationId, userId: { not: me.userId } },
        orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
        select: { userId: true },
      }).catch(async () => {
        return prisma.conversationMember.findFirst({
          where: { conversationId, userId: { not: me.userId } },
          select: { userId: true },
        });
      });
      if (successor) {
        try {
          await prisma.conversationMember.update({
            where: { userId_conversationId: { userId: successor.userId, conversationId } },
            data: { role: "ADMIN" },
          });
        } catch (error) {
          if (!isMissingRoleColumn(error)) throw error;
          // role column missing — skip handoff (legacy DB)
        }
      }
    }
  }

  await prisma.conversationMember.delete({
    where: { userId_conversationId: { userId: me.userId, conversationId } },
  });

  const remaining = await prisma.conversationMember.count({ where: { conversationId } });
  if (remaining === 0) {
    await prisma.conversation.delete({ where: { id: conversationId } }).catch(() => { /* race-safe */ });
  }

  return NextResponse.json({ left: true, isGroup: conversation.isGroup });
}
