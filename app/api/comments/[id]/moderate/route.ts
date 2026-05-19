import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseRequestJson } from "@/lib/request-json";
import { commentModerateSchema } from "@/lib/schemas/api-bodies";
import { CommentModerationStatus } from "@/lib/generated/prisma/client";
import { createNotificationIfAllowed } from "@/lib/notifications";
import { grantXP } from "@/lib/services/xp.service";
import { logBackgroundError } from "@/lib/logger";
import { invalidatePostDetailViewer } from "@/lib/entity-cache";
import { applyCommentMentions } from "@/lib/post-mentions";

// POST /api/comments/[id]/moderate — post author approves or rejects a comment
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: commentId } = await params;
  const parsed = await parseRequestJson(req, commentModerateSchema);
  if (!parsed.ok) return parsed.response;
  const { action } = parsed.data;

  const row = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      post: { select: { id: true, authorId: true } },
    },
  });

  if (!row) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  if (row.post.authorId !== me.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const nextStatus =
    action === "approve" ? CommentModerationStatus.APPROVED : CommentModerationStatus.REJECTED;
  const wasPending = row.moderationStatus === CommentModerationStatus.PENDING;

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { moderationStatus: nextStatus },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  if (action === "approve" && wasPending && updated.authorId !== row.post.authorId) {
    await createNotificationIfAllowed({
      userId: row.post.authorId,
      fromId: updated.authorId,
      type: "comment",
      postId: row.post.id,
    }).catch(logBackgroundError("notifications.comment.moderated"));

    grantXP({
      userId: row.post.authorId,
      action: "COMMENT_RECEIVED",
      actorId: updated.authorId,
      postId: row.post.id,
    }).catch(logBackgroundError("xp.grant.COMMENT_RECEIVED.moderated"));

    applyCommentMentions({
      commentId: updated.id,
      postId: row.post.id,
      postAuthorId: row.post.authorId,
      commentAuthorId: updated.authorId,
      text: updated.text,
    }).catch(logBackgroundError("mentions.comment.moderated"));
  }

  await invalidatePostDetailViewer(me.userId, row.post.id);
  await invalidatePostDetailViewer(updated.authorId, row.post.id);

  return NextResponse.json({ comment: updated });
}
