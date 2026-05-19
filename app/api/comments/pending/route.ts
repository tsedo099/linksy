import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { CommentModerationStatus } from "@/lib/generated/prisma/client";
import { getBlockedUserIds } from "@/lib/user-blocks";

const PAGE_SIZE = 30;

// GET /api/comments/pending — pending comments on posts I own (moderation queue)
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const cursor = req.nextUrl.searchParams.get("cursor");
  const blockedIds = await getBlockedUserIds(user.userId);

  const rows = await prisma.comment.findMany({
    where: {
      moderationStatus: CommentModerationStatus.PENDING,
      post: { authorId: user.userId },
      ...(blockedIds.length ? { authorId: { notIn: blockedIds } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      post: { select: { id: true, mediaUrls: true, caption: true } },
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return NextResponse.json({
    comments: items,
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
  });
}
