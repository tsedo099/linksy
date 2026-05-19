import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { invalidateBlockedUserIdsCache } from "@/lib/user-blocks";

// POST /api/users/[id]/block - block a user
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: targetId } = await params;
  if (targetId === me.userId) {
    return NextResponse.json({ error: "You cannot block yourself." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, username: true, displayName: true, avatarUrl: true },
  });

  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  await prisma.$transaction([
    prisma.$executeRaw`
      INSERT INTO "UserBlock" ("blockerId", "blockedId")
      VALUES (${me.userId}, ${targetId})
      ON CONFLICT ("blockerId", "blockedId") DO NOTHING
    `,
    prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: me.userId, followingId: targetId },
          { followerId: targetId, followingId: me.userId },
        ],
      },
    }),
    prisma.closeCircle.deleteMany({
      where: {
        OR: [
          { userId: me.userId, targetId },
          { userId: targetId, targetId: me.userId },
        ],
      },
    }),
    prisma.favorite.deleteMany({
      where: {
        OR: [
          { userId: me.userId, targetId },
          { userId: targetId, targetId: me.userId },
        ],
      },
    }),
    prisma.notification.deleteMany({
      where: {
        OR: [
          { userId: me.userId, fromId: targetId },
          { userId: targetId, fromId: me.userId },
        ],
      },
    }),
  ]);

  invalidateBlockedUserIdsCache(me.userId, targetId);
  return NextResponse.json({ blocked: true, user: target });
}

// DELETE /api/users/[id]/block - unblock a user
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: targetId } = await params;
  await prisma.$executeRaw`
    DELETE FROM "UserBlock"
    WHERE "blockerId" = ${me.userId}
      AND "blockedId" = ${targetId}
  `;

  invalidateBlockedUserIdsCache(me.userId, targetId);
  return NextResponse.json({ blocked: false });
}
