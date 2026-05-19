import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { areUsersBlocked, getBlockedUserIds } from "@/lib/user-blocks";
import { parseRequestJsonAllowEmpty } from "@/lib/request-json";
import { connectionsDeleteSchema } from "@/lib/schemas/api-bodies";

type ConnectionType = "followers" | "following";

function isConnectionType(value: string | null): value is ConnectionType {
  return value === "followers" || value === "following";
}

// GET /api/users/[id]/connections?type=followers|following
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const type = req.nextUrl.searchParams.get("type");
  if (!isConnectionType(type)) {
    return NextResponse.json({ error: "Invalid connection type." }, { status: 400 });
  }

  const owner = await prisma.user.findUnique({
    where: { id },
    select: { id: true, showFollowers: true, showFollowing: true },
  });

  if (!owner) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const isOwner = owner.id === me.userId;
  if (!isOwner && await areUsersBlocked(me.userId, owner.id)) {
    return NextResponse.json({ error: "Connections unavailable." }, { status: 403 });
  }

  const canView = isOwner || (type === "followers" ? owner.showFollowers : owner.showFollowing);

  if (!canView) {
    return NextResponse.json({ hidden: true, users: [] });
  }

  const blockedIds = await getBlockedUserIds(me.userId);
  const blockedSet = new Set(blockedIds);

  const userSelect = {
    id: true,
    username: true,
    displayName: true,
    bio: true,
    avatarUrl: true,
    followers: { where: { followerId: me.userId }, select: { followerId: true } },
  };

  const connections = type === "followers"
    ? await prisma.follow.findMany({
        where: { followingId: id },
        orderBy: { createdAt: "desc" },
        include: { follower: { select: userSelect } },
      })
    : await prisma.follow.findMany({
        where: { followerId: id },
        orderBy: { createdAt: "desc" },
        include: { following: { select: userSelect } },
      });

  const users = connections.map((connection) => {
    const user = type === "followers"
      ? ("follower" in connection ? connection.follower : null)
      : ("following" in connection ? connection.following : null);
    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      followedByMe: user.followers.length > 0,
      isSelf: user.id === me.userId,
    };
  }).filter((user) => user && !blockedSet.has(user.id));

  return NextResponse.json({ users });
}

// DELETE /api/users/[id]/connections - manage your own follower/following lists
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  if (id !== me.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const parsed = await parseRequestJsonAllowEmpty(req, connectionsDeleteSchema);
  if (!parsed.ok) return parsed.response;
  const { type, targetId } = parsed.data;

  if (!isConnectionType(type ?? null) || !targetId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (type === "followers") {
    await prisma.follow.deleteMany({
      where: { followerId: targetId, followingId: me.userId },
    });
    return NextResponse.json({ ok: true });
  }

  await prisma.follow.deleteMany({
    where: { followerId: me.userId, followingId: targetId },
  });
  return NextResponse.json({ ok: true });
}
