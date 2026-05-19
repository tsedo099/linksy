import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { isSafetyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { parseRequestJson } from "@/lib/request-json";
import { ADMIN_DESTRUCTIVE_LIMIT, enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { invalidatePostDetailViewer } from "@/lib/entity-cache";
import { logBackgroundError } from "@/lib/logger";

const BULK_DELETE_MAX = 50;

const bulkDeleteSchema = z.object({
  postIds: z
    .array(z.string().min(1).max(64))
    .min(1, "At least one post id is required.")
    .max(BULK_DELETE_MAX, `Up to ${BULK_DELETE_MAX} posts per request.`),
  reason: z.string().max(500).optional(),
});

/**
 * DELETE /api/admin/posts/bulk-delete — admin bulk post removal.
 *
 * Rate-limited at the destructive tier (10/min per admin) so a runaway client
 * or hijacked session can't nuke the platform. Each batch is single-statement
 * (`deleteMany`) and writes one audit log row per deletion so the trail is
 * per-post grep-able (the human-readable "who deleted what" answer the audit
 * doc cares about).
 */
export async function DELETE(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const blocked = await enforceAdminRateLimit("post.bulk-delete", me.userId, ADMIN_DESTRUCTIVE_LIMIT);
  if (blocked) return blocked;

  const parsed = await parseRequestJson(req, bulkDeleteSchema);
  if (!parsed.ok) return parsed.response;
  const { postIds, reason } = parsed.data;

  // Dedupe and fetch the existing IDs so we can (a) report what actually got
  // hit and (b) write per-post audit rows that include author + caption snapshot.
  const uniqueIds = Array.from(new Set(postIds));
  const existing = await prisma.post.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, authorId: true, caption: true },
  });

  if (existing.length === 0) {
    return NextResponse.json({ deleted: 0, postIds: [], notFound: uniqueIds });
  }

  const existingIds = existing.map((p) => p.id);
  const notFound = uniqueIds.filter((id) => !existingIds.includes(id));

  const { count } = await prisma.post.deleteMany({
    where: { id: { in: existingIds } },
  });

  // One audit row per post: keeps the per-post trail intact. The metadata
  // captures the snapshot we just lost from the DB, so an admin can answer
  // "what was in this post" without restoring it.
  for (const post of existing) {
    await writeAuditLog({
      action: "ADMIN_POST_DELETE",
      actorUserId: me.userId,
      targetType: "POST",
      targetId: post.id,
      metadata: {
        bulk: true,
        authorId: post.authorId,
        caption: post.caption ? post.caption.slice(0, 200) : null,
        ...(reason ? { reason } : {}),
      },
      request: req,
    }).catch(logBackgroundError("audit.adminPostBulkDelete"));

    // Per-viewer cache lives keyed on (viewerId, postId). We blow the author's
    // own view so refreshing their feed/profile doesn't show the deleted row.
    await invalidatePostDetailViewer(post.authorId, post.id).catch(
      logBackgroundError("entityCache.adminPostBulkDelete"),
    );
  }

  return NextResponse.json({
    deleted: count,
    postIds: existingIds,
    notFound,
  });
}
