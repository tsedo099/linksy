import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isSafetyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { logBackgroundError } from "@/lib/logger";
import { parseRequestJson } from "@/lib/request-json";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { z } from "zod";

/**
 * GET /api/admin/reports — paginated triage queue of pending user reports.
 *
 * Status filter: `?status=OPEN` (default) | `RESOLVED` | `DISMISSED` | `ALL`.
 * Returns the report plus a normalised target preview so the UI can render
 * "delete post" / "block user" actions without an extra roundtrip.
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const statusFilter = (searchParams.get("status") ?? "OPEN").toUpperCase();
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));

  const rows = await prisma.report.findMany({
    where: statusFilter === "ALL" ? {} : { status: statusFilter },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    include: {
      reporter: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  // Pre-fetch the target user / post in one batch each so the UI can render
  // "delete post" / "view profile" without N+1 roundtrips.
  const userIds = rows.filter((r) => r.targetType === "USER").map((r) => r.targetId);
  const postIds = rows.filter((r) => r.targetType === "POST").map((r) => r.targetId);
  const [targetUsers, targetPosts] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, username: true, displayName: true, avatarUrl: true, suspendedUntil: true },
        })
      : Promise.resolve([]),
    postIds.length
      ? prisma.post.findMany({
          where: { id: { in: postIds } },
          select: {
            id: true,
            caption: true,
            mediaUrls: true,
            createdAt: true,
            author: { select: { id: true, username: true, displayName: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  const userMap = new Map(targetUsers.map((u) => [u.id, u]));
  const postMap = new Map(targetPosts.map((p) => [p.id, p]));

  return NextResponse.json({
    reports: rows.map((r) => ({
      reporterId: r.reporterId,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      reporter: r.reporter,
      target:
        r.targetType === "USER"
          ? { kind: "user", user: userMap.get(r.targetId) ?? null }
          : r.targetType === "POST"
            ? {
                kind: "post",
                post: postMap.get(r.targetId)
                  ? {
                      ...postMap.get(r.targetId)!,
                      createdAt: postMap.get(r.targetId)!.createdAt.toISOString(),
                    }
                  : null,
              }
            : { kind: r.targetType.toLowerCase(), raw: r.targetId },
    })),
  });
}

const patchSchema = z.object({
  reporterId: z.string().min(1),
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]),
  note: z.string().max(500).optional(),
});

/**
 * PATCH /api/admin/reports — transition a single report's status.
 *
 * Body: `{ reporterId, targetType, targetId, status, note? }`. The compound
 * (reporterId, targetType, targetId) is the row's primary key — same
 * reporter can only file one report per target.
 */
export async function PATCH(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const blocked = await enforceAdminRateLimit("report.transition", me.userId);
  if (blocked) return blocked;

  const parsed = await parseRequestJson(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const { reporterId, targetType, targetId, status, note } = parsed.data;

  try {
    const updated = await prisma.report.update({
      where: { reporterId_targetType_targetId: { reporterId, targetType, targetId } },
      data: { status },
    });
    writeAuditLog({
      action: `MODERATOR_REPORT_${status}`,
      actorUserId: me.userId,
      targetType: "Report",
      targetId: `${reporterId}:${targetType}:${targetId}`,
      metadata: { note: note ?? null, originalTargetType: targetType, originalTargetId: targetId },
      request: req,
    }).catch(logBackgroundError("admin.report.audit"));

    return NextResponse.json({
      ok: true,
      report: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Could not update report.", detail: err instanceof Error ? err.message : null },
      { status: 404 },
    );
  }
}
