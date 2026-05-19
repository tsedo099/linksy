import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { Prisma } from "@/lib/generated/prisma/client";
import { parseRequestJsonAllowEmpty } from "@/lib/request-json";
import { conversationBlockSchema } from "@/lib/schemas/api-bodies";

function isMissingBlockColumn(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return String(error.meta?.column ?? error.message ?? "").includes("isBlocked");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("isBlocked") || message.includes("Unknown argument `isBlocked`");
}

// POST /api/conversations/[id]/block - toggle per-conversation block flag for the current user
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId } = await params;
  const parsed = await parseRequestJsonAllowEmpty(req, conversationBlockSchema);
  if (!parsed.ok) return parsed.response;
  const blocked = parsed.data.blocked !== false;

  const member = await prisma.conversationMember.findUnique({
    where: { userId_conversationId: { userId: me.userId, conversationId } },
    select: { userId: true },
  });
  if (!member) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  try {
    await prisma.conversationMember.update({
      where: { userId_conversationId: { userId: me.userId, conversationId } },
      data: { isBlocked: blocked },
    });
  } catch (error) {
    if (isMissingBlockColumn(error)) {
      return NextResponse.json(
        { error: "Per-conversation block is temporarily unavailable. Please retry once the database migration is applied." },
        { status: 503 },
      );
    }
    throw error;
  }

  return NextResponse.json({ blocked });
}
