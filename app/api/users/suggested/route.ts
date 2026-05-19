import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { userNotPendingHardDelete } from "@/lib/user-not-pending-deletion";

// GET /api/users/suggested?limit=20
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.max(1, Math.min(50, Number.parseInt(limitParam ?? "20", 10) || 20));

  const following = await prisma.follow.findMany({
    where: { followerId: me.userId },
    select: { followingId: true },
  });
  const blockedIds = await getBlockedUserIds(me.userId);
  const excludedIds = [me.userId, ...blockedIds, ...following.map((f) => f.followingId)];

  const users = await prisma.user.findMany({
    where: { id: { notIn: excludedIds }, ...userNotPendingHardDelete },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      isVerified: true,
      _count: { select: { followers: true } },
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      isVerified: u.isVerified,
      followerCount: u._count.followers,
      followedByMe: false,
      context: u._count.followers > 0 ? `${u._count.followers} followers` : "Suggested for you",
    })),
  });
}
