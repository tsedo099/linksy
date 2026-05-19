import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { areUsersBlocked } from "@/lib/user-blocks";
import { publishedPostWhere } from "@/lib/post-schedule";
import { withPostViewerFields } from "@/lib/post-viewer";
import { withCoAuthors } from "@/lib/post-collaborators";
import { approvedCommentsOnlyCount } from "@/lib/post-comment-moderation";
import { userNotPendingHardDelete } from "@/lib/user-not-pending-deletion";

const PAGE_SIZE = 12;
const FETCH = PAGE_SIZE + 1;

// GET /api/users/[id]/posts - user post grid (up to 3 pinned first page, Instagram-style)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const cursor = req.nextUrl.searchParams.get("cursor");

  if (id !== me.userId && await areUsersBlocked(me.userId, id)) {
    return NextResponse.json({ error: "Posts unavailable." }, { status: 403 });
  }

  const profileOwner = await prisma.user.findFirst({
    where: { id, ...userNotPendingHardDelete },
    select: { pinnedPostId: true },
  });

  if (!profileOwner) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const pinRows = await prisma.pinnedPost.findMany({
    where: { userId: id },
    orderBy: { position: "asc" },
    select: { postId: true },
  });

  let orderedPinIds = pinRows.map((r) => r.postId);
  const legacyPin = profileOwner?.pinnedPostId ?? null;
  if (legacyPin && !orderedPinIds.includes(legacyPin)) {
    orderedPinIds = [legacyPin, ...orderedPinIds].slice(0, 3);
  }

  const pinnedIdSet = new Set(orderedPinIds);

  const baseSelect = {
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
  } as const;

  const isProfileOwner = id === me.userId;

  const posts = await prisma.post.findMany({
    where: {
      AND: [
        {
          authorId: id,
          ...(pinnedIdSet.size ? { id: { notIn: [...pinnedIdSet] } } : {}),
        },
        ...(isProfileOwner ? [] : [publishedPostWhere()]),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: FETCH,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { ...baseSelect, scheduledAt: true },
  });

  const hasMore = posts.length === FETCH;
  const slice = hasMore ? posts.slice(0, PAGE_SIZE) : posts;

  const mapRow = (row: (typeof posts)[0], isPinned: boolean) => ({
    ...withPostViewerFields(withCoAuthors(row), me.userId),
    isPinned,
  });

  let payload = slice.map((row) => mapRow(row, false));

  if (!cursor && orderedPinIds.length) {
    const pinnedRows = await prisma.post.findMany({
      where: {
        AND: [
          { id: { in: orderedPinIds }, authorId: id },
          ...(isProfileOwner ? [] : [publishedPostWhere()]),
        ],
      },
      select: { ...baseSelect, scheduledAt: true },
    });
    const byId = new Map(pinnedRows.map((p) => [p.id, p]));
    const pinnedOrdered = orderedPinIds
      .map((pid) => byId.get(pid))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((row) => mapRow(row, true));

    payload = [...pinnedOrdered, ...payload];
  }

  return NextResponse.json({
    posts: payload,
    nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null,
  });
}
