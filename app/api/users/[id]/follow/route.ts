import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { grantXP } from "@/lib/services/xp.service";
import { areUsersBlocked } from "@/lib/user-blocks";
import { createNotificationIfAllowed } from "@/lib/notifications";
import { NotificationType } from "@/lib/generated/prisma/client";
import { logBackgroundError } from "@/lib/logger";
import { invalidateUserProfileViewer } from "@/lib/entity-cache";

// POST /api/users/[id]/follow - follow or unfollow
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: targetId } = await params;

  if (targetId === me.userId) {
    return NextResponse.json({ error: "You cannot follow yourself." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: me.userId, followingId: targetId } },
  });

  if (existing) {
    await prisma.$transaction([
      prisma.follow.delete({
        where: { followerId_followingId: { followerId: me.userId, followingId: targetId } },
      }),
      prisma.notification.deleteMany({
        where: { userId: targetId, fromId: me.userId, type: NotificationType.follow, postId: null },
      }),
    ]);
    await invalidateUserProfileViewer(me.userId, targetId);
    return NextResponse.json({ following: false });
  }

  if (await areUsersBlocked(me.userId, targetId)) {
    return NextResponse.json({ error: "You cannot follow this user." }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.notification.deleteMany({
      where: { userId: targetId, fromId: me.userId, type: NotificationType.follow, postId: null },
    }),
    prisma.follow.create({ data: { followerId: me.userId, followingId: targetId } }),
  ]);
  await createNotificationIfAllowed({
    userId: targetId,
    fromId: me.userId,
    type: "follow",
  }).catch(() => { /* notifications are best-effort */ });

  // grant XP to followed user (non-blocking)
  grantXP({
    userId:  targetId,
    action:  "FOLLOW_RECEIVED",
    actorId: me.userId,
  }).catch(logBackgroundError("xp.grant.FOLLOW_RECEIVED"));

  await invalidateUserProfileViewer(me.userId, targetId);
  return NextResponse.json({ following: true });
}
