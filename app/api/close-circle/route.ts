import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { areUsersBlocked, getBlockedUserIds } from "@/lib/user-blocks";
import { parseRequestJson } from "@/lib/request-json";
import { targetIdBodySchema } from "@/lib/schemas/api-bodies";

// GET /api/close-circle - list my close circle members
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const blockedIds = await getBlockedUserIds(me.userId);

  const members = await prisma.closeCircle.findMany({
    where: { userId: me.userId, targetId: { notIn: blockedIds } },
    include: {
      target: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ members: members.map((m) => m.target) });
}

// POST /api/close-circle - add a user to close circle
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, targetIdBodySchema);
  if (!parsed.ok) return parsed.response;
  const { targetId } = parsed.data;
  if (!targetId || targetId === me.userId) {
    return NextResponse.json({ error: "Invalid target." }, { status: 400 });
  }
  if (await areUsersBlocked(me.userId, targetId)) {
    return NextResponse.json({ error: "You cannot add this user." }, { status: 403 });
  }

  const count = await prisma.closeCircle.count({ where: { userId: me.userId } });
  if (count >= 50) {
    return NextResponse.json({ error: "Close Circle is limited to 50 people." }, { status: 400 });
  }

  await prisma.closeCircle.upsert({
    where: { userId_targetId: { userId: me.userId, targetId } },
    create: { userId: me.userId, targetId },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/close-circle - remove a user from close circle
export async function DELETE(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsedDel = await parseRequestJson(req, targetIdBodySchema);
  if (!parsedDel.ok) return parsedDel.response;
  const { targetId } = parsedDel.data;

  await prisma.closeCircle.deleteMany({
    where: { userId: me.userId, targetId },
  });

  return NextResponse.json({ ok: true });
}
