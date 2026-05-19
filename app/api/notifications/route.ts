import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { notificationFeedWhere } from "@/lib/notification-rules";

// GET /api/notifications - notification list
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const cursor = req.nextUrl.searchParams.get("cursor");
  const blockedIds = await getBlockedUserIds(me.userId);
  const realNotificationWhere = await notificationFeedWhere(me.userId, blockedIds);

  // List + unread count are independent — fire them in parallel so the
  // polling endpoint pays one round trip instead of two.
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: realNotificationWhere,
      orderBy: { createdAt: "desc" },
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        from: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            followers: { where: { followerId: me.userId }, select: { followerId: true } },
          },
        },
        post: { select: { id: true, mediaUrls: true } },
        story: { select: { id: true, mediaUrl: true } },
      },
    }),
    prisma.notification.count({
      where: { ...realNotificationWhere, read: false },
    }),
  ]);

  const hasMore = notifications.length > 20;
  const rawItems = hasMore ? notifications.slice(0, 20) : notifications;

  const peerIdSet = new Set<string>();
  for (const row of rawItems) {
    for (const id of row.groupPeerIds ?? []) peerIdSet.add(id);
  }
  const peerUsers =
    peerIdSet.size === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: [...peerIdSet] }, accountDeletionRequestedAt: null },
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            followers: { where: { followerId: me.userId }, select: { followerId: true } },
          },
        });
  const peerMap = new Map(
    peerUsers.map((u) => [
      u.id,
      {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        followedByMe: u.followers.length > 0,
      },
    ]),
  );

  const items = rawItems.map(({ from, ...notification }) => {
    const groupPeers = (notification.groupPeerIds ?? [])
      .map((id) => peerMap.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    return {
      ...notification,
      from: {
        id: from.id,
        username: from.username,
        displayName: from.displayName,
        avatarUrl: from.avatarUrl,
        followedByMe: from.followers.length > 0,
      },
      groupPeers,
    };
  });

  return NextResponse.json(
    {
      notifications: items,
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      unreadCount,
    },
    {
      // Per-viewer payload — browser-only cache. SSE-driven realtime is
      // the primary push path; this 5s window only short-circuits the
      // backup poll between live events.
      headers: { "Cache-Control": "private, max-age=5" },
    },
  );
}
