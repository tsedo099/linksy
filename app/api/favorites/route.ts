import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { areUsersBlocked, getBlockedUserIds } from "@/lib/user-blocks";
import { parseRequestJson } from "@/lib/request-json";
import { targetIdBodySchema } from "@/lib/schemas/api-bodies";

// GET /api/favorites - list my favorite people
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const blockedIds = await getBlockedUserIds(me.userId);

  const favorites = await prisma.favorite.findMany({
    where: { userId: me.userId, targetId: { notIn: blockedIds } },
    include: {
      target: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ favorites: favorites.map((f) => f.target) });
}

// POST /api/favorites - add to favorites
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
    return NextResponse.json({ error: "You cannot favorite this user." }, { status: 403 });
  }

  const count = await prisma.favorite.count({ where: { userId: me.userId } });
  if (count >= 20) {
    return NextResponse.json({ error: "Favorites is limited to 20 people." }, { status: 400 });
  }

  await prisma.favorite.upsert({
    where: { userId_targetId: { userId: me.userId, targetId } },
    create: { userId: me.userId, targetId },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/favorites - remove from favorites
export async function DELETE(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsedDel = await parseRequestJson(req, targetIdBodySchema);
  if (!parsedDel.ok) return parsedDel.response;
  const { targetId } = parsedDel.data;

  await prisma.favorite.deleteMany({
    where: { userId: me.userId, targetId },
  });

  return NextResponse.json({ ok: true });
}
