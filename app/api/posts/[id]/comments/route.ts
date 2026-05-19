import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { grantXP } from "@/lib/services/xp.service";
import { areUsersBlocked, getBlockedUserIds } from "@/lib/user-blocks";
import { createNotificationIfAllowed } from "@/lib/notifications";
import { logBackgroundError } from "@/lib/logger";
import { parseRequestJson } from "@/lib/request-json";
import { commentCreateSchema } from "@/lib/schemas/api-bodies";
import { invalidatePostDetailViewer } from "@/lib/entity-cache";
import { sanitizePlainText } from "@/lib/sanitize-html";
import { applyCommentMentions } from "@/lib/post-mentions";
import { commentThreadWhere } from "@/lib/post-comment-moderation";
import { CommentModerationStatus } from "@/lib/generated/prisma/client";
import { scanText } from "@/lib/safety-moderation";
import { isUserCommentBanned, recordCommentWarning } from "@/lib/safety-warnings";

// GET /api/posts/[id]/comments - fetch comments
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: postId } = await params;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true },
  });

  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (post.authorId !== user.userId && await areUsersBlocked(user.userId, post.authorId)) {
    return NextResponse.json({ error: "Post unavailable." }, { status: 403 });
  }

  const blockedIds = await getBlockedUserIds(user.userId);

  const comments = await prisma.comment.findMany({
    where: {
      postId,
      ...commentThreadWhere(user.userId, post.authorId, blockedIds),
    },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({ comments });
}

// POST /api/posts/[id]/comments - add a comment
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: postId } = await params;
  const parsed = await parseRequestJson(req, commentCreateSchema);
  if (!parsed.ok) return parsed.response;
  const { text } = parsed.data;

  const textSafe = sanitizePlainText(text.trim());
  if (!textSafe) {
    return NextResponse.json({ error: "Comment cannot be empty." }, { status: 400 });
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { authorId: true, allowComments: true, moderateComments: true },
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  if (post.allowComments === false && post.authorId !== user.userId) {
    return NextResponse.json({ error: "Comments are turned off for this post." }, { status: 403 });
  }

  if (post.authorId !== user.userId && await areUsersBlocked(user.userId, post.authorId)) {
    return NextResponse.json({ error: "Post unavailable." }, { status: 403 });
  }

  const ban = await isUserCommentBanned(user.userId);
  if (ban.banned && ban.until) {
    return NextResponse.json(
      {
        error: "You can't post comments right now. Please review the Safe Social guidelines.",
        banUntil: ban.until.toISOString(),
      },
      { status: 403 },
    );
  }

  const safety = scanText(textSafe);
  if (!safety.allowed) {
    return NextResponse.json(
      { error: safety.userMessage ?? "Comment cannot be posted.", safety },
      { status: 422 },
    );
  }

  let warningInfo: Awaited<ReturnType<typeof recordCommentWarning>> | null = null;
  if (safety.action === "warn" || safety.action === "quarantine") {
    warningInfo = await recordCommentWarning({
      userId: user.userId,
      result: safety,
      commentText: textSafe,
    }).catch((err) => {
      logBackgroundError("safety.warning.record")(err);
      return null;
    });
    if (warningInfo?.banApplied && warningInfo.banUntil) {
      return NextResponse.json(
        {
          error: "You've reached the Safe Social warning limit. Commenting is paused for 1 week.",
          banUntil: warningInfo.banUntil.toISOString(),
          safety,
        },
        { status: 403 },
      );
    }
  }

  const needsModeration = post.moderateComments === true && post.authorId !== user.userId;
  const moderationStatus = needsModeration
    ? CommentModerationStatus.PENDING
    : CommentModerationStatus.APPROVED;

  const comment = await prisma.comment.create({
    data: { postId, authorId: user.userId, text: textSafe, moderationStatus },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
  if (!needsModeration) {
    if (post.authorId !== user.userId) {
      await createNotificationIfAllowed({
        userId: post.authorId,
        fromId: user.userId,
        type: "comment",
        postId,
      }).catch(logBackgroundError("notifications.comment.created"));

      grantXP({
        userId:  post.authorId,
        action:  "COMMENT_RECEIVED",
        actorId: user.userId,
        postId,
      }).catch(logBackgroundError("xp.grant.COMMENT_RECEIVED"));
    }

    applyCommentMentions({
      commentId: comment.id,
      postId,
      postAuthorId: post.authorId,
      commentAuthorId: user.userId,
      text: textSafe,
    }).catch(logBackgroundError("mentions.comment"));
  }

  await invalidatePostDetailViewer(user.userId, postId);
  await invalidatePostDetailViewer(post.authorId, postId);

  return NextResponse.json(
    {
      comment,
      safety,
      warning: warningInfo
        ? {
            warningsInWindow: warningInfo.warningsInWindow,
            banApplied: warningInfo.banApplied,
            banUntil: warningInfo.banUntil ? warningInfo.banUntil.toISOString() : null,
          }
        : null,
    },
    { status: 201 },
  );
}
