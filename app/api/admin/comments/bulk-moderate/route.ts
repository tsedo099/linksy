import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { isSafetyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { parseRequestJson } from "@/lib/request-json";
import { CommentModerationStatus } from "@/lib/generated/prisma/client";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { invalidatePostDetailViewer } from "@/lib/entity-cache";
import { logBackgroundError } from "@/lib/logger";

const BULK_MODERATE_MAX = 100;

const bulkModerateSchema = z.object({
  commentIds: z
    .array(z.string().min(1).max(64))
    .min(1, "At least one comment id is required.")
    .max(BULK_MODERATE_MAX, `Up to ${BULK_MODERATE_MAX} comments per request.`),
  action: z.enum(["reject", "approve"]),
  reason: z.string().max(500).optional(),
});

/**
 * POST /api/admin/comments/bulk-moderate — flip many comments to a single
 * moderation status in one round-trip.
 *
 * Default tier rate-limit (60/min per admin) — these are reversible (you can
 * flip back to APPROVED) so they don't need the destructive tier.
 *
 * Behaviour:
 * - `action: "reject"` → `moderationStatus = REJECTED` (hidden from feeds)
 * - `action: "approve"` → `moderationStatus = APPROVED`
 * - Audit row per comment, with the post + author + body snippet captured so
 *   the trail survives a later deletion.
 * - Post-viewer cache invalidated per post so the next render reflects the
 *   new moderation state.
 */
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const blocked = await enforceAdminRateLimit("comment.bulk-moderate", me.userId);
  if (blocked) return blocked;

  const parsed = await parseRequestJson(req, bulkModerateSchema);
  if (!parsed.ok) return parsed.response;
  const { commentIds, action, reason } = parsed.data;

  const uniqueIds = Array.from(new Set(commentIds));
  const existing = await prisma.comment.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      text: true,
      authorId: true,
      postId: true,
      moderationStatus: true,
    },
  });

  if (existing.length === 0) {
    return NextResponse.json({ moderated: 0, commentIds: [], notFound: uniqueIds, action });
  }

  const nextStatus =
    action === "reject" ? CommentModerationStatus.REJECTED : CommentModerationStatus.APPROVED;

  // Skip rows already at the target status — saves an audit-log entry and a
  // cache invalidation per no-op.
  const toUpdate = existing.filter((c) => c.moderationStatus !== nextStatus);
  const skipped = existing.length - toUpdate.length;

  if (toUpdate.length === 0) {
    return NextResponse.json({
      moderated: 0,
      commentIds: [],
      notFound: uniqueIds.filter((id) => !existing.some((c) => c.id === id)),
      skipped,
      action,
    });
  }

  await prisma.comment.updateMany({
    where: { id: { in: toUpdate.map((c) => c.id) } },
    data: { moderationStatus: nextStatus },
  });

  const auditAction =
    action === "reject" ? "ADMIN_COMMENT_HIDE" : "ADMIN_COMMENT_APPROVE";

  // Per-comment audit + per-post cache invalidation. Posts may repeat across
  // the batch (multiple comments on one post) — dedupe so we don't pay the
  // cache cost N times for one post.
  const invalidatedPosts = new Set<string>();
  for (const comment of toUpdate) {
    await writeAuditLog({
      action: auditAction,
      actorUserId: me.userId,
      targetType: "COMMENT",
      targetId: comment.id,
      metadata: {
        bulk: true,
        authorId: comment.authorId,
        postId: comment.postId,
        previousStatus: comment.moderationStatus,
        textSnippet: comment.text.slice(0, 200),
        ...(reason ? { reason } : {}),
      },
      request: req,
    }).catch(logBackgroundError("audit.adminCommentBulkModerate"));

    if (!invalidatedPosts.has(comment.postId)) {
      invalidatedPosts.add(comment.postId);
      await invalidatePostDetailViewer(comment.authorId, comment.postId).catch(
        logBackgroundError("entityCache.adminCommentBulkModerate"),
      );
    }
  }

  return NextResponse.json({
    moderated: toUpdate.length,
    commentIds: toUpdate.map((c) => c.id),
    notFound: uniqueIds.filter((id) => !existing.some((c) => c.id === id)),
    skipped,
    action,
  });
}
