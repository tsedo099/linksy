import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { areUsersBlocked, getBlockedUserIds } from "@/lib/user-blocks";
import { publishedPostWhere } from "@/lib/post-schedule";
import { withPostViewerFields } from "@/lib/post-viewer";
import { withCoAuthors } from "@/lib/post-collaborators";
import { approvedCommentsOnlyCount } from "@/lib/post-comment-moderation";
import { userNotPendingHardDelete } from "@/lib/user-not-pending-deletion";

const PAGE_SIZE = 24;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const cursor = req.nextUrl.searchParams.get("cursor");
  const now = new Date();

  if (id !== me.userId && await areUsersBlocked(me.userId, id)) {
    return NextResponse.json({ error: "Tagged posts unavailable." }, { status: 403 });
  }

  const target = await prisma.user.findFirst({
    where: { id, ...userNotPendingHardDelete },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const [blockedIds, following, circleRows] = await Promise.all([
    getBlockedUserIds(me.userId),
    prisma.follow.findMany({
      where: { followerId: me.userId },
      select: { followingId: true },
    }),
    prisma.closeCircle.findMany({
      where: { userId: me.userId },
      select: { targetId: true },
    }),
  ]);

  const blockedSet = new Set(blockedIds);
  const friendsAndSelf = [
    ...following.map((row) => row.followingId).filter((userId) => !blockedSet.has(userId)),
    me.userId,
  ];
  const circleAndSelf = [
    ...circleRows.map((row) => row.targetId).filter((userId) => !blockedSet.has(userId)),
    me.userId,
  ];

  const posts = await prisma.post.findMany({
    where: {
      AND: [
        { collaborators: { some: { userId: id } } },
        { authorId: { not: id } },
        ...(blockedIds.length > 0 ? [{ authorId: { notIn: blockedIds } }] : []),
        {
          OR: [
            { audience: "PUBLIC" },
            { audience: "FRIENDS", authorId: { in: friendsAndSelf } },
            { audience: "CLOSE_CIRCLE", authorId: { in: circleAndSelf } },
          ],
        },
        publishedPostWhere(now),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      authorId: true,
      mediaUrls: true,
      caption: true,
      createdAt: true,
      allowComments: true,
      hideLikes: true,
      _count: { select: { likes: true, ...approvedCommentsOnlyCount } },
      collaborators: {
        select: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
        },
      },
    },
  });

  const hasMore = posts.length > PAGE_SIZE;
  const slice = hasMore ? posts.slice(0, PAGE_SIZE) : posts;

  return NextResponse.json({
    posts: slice.map((post) => withPostViewerFields(withCoAuthors(post), me.userId)),
    nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null,
  });
}
