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
 * GET /api/admin/feedback — inbox of user-submitted feedback.
 *
 * Filters:
 *   - `?status=OPEN` (default) | `ACKNOWLEDGED` | `RESOLVED` | `CLOSED` | `ALL`
 *   - `?category=BUG` | `FEATURE_REQUEST` | `PRAISE` | `COMPLAINT` | `OTHER`
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const statusFilter = (searchParams.get("status") ?? "OPEN").toUpperCase();
  const categoryFilter = searchParams.get("category")?.toUpperCase();
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));

  const where: { status?: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "CLOSED"; category?: "BUG" | "FEATURE_REQUEST" | "PRAISE" | "COMPLAINT" | "OTHER" } = {};
  if (statusFilter !== "ALL") {
    where.status = statusFilter as typeof where.status;
  }
  if (categoryFilter) {
    where.category = categoryFilter as typeof where.category;
  }

  const rows = await prisma.feedback.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({
    feedback: rows.map((f) => ({
      id: f.id,
      userId: f.userId,
      category: f.category,
      message: f.message,
      contextUrl: f.contextUrl,
      userAgent: f.userAgent,
      appVersion: f.appVersion,
      status: f.status,
      createdAt: f.createdAt.toISOString(),
      user: f.user,
    })),
  });
}

const patchSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED", "CLOSED"]),
});

/**
 * PATCH /api/admin/feedback — transition a feedback row's status.
 *
 * Body: `{ id, status }`. We don't store admin-side replies here — the typical
 * follow-up is an email to the user; this endpoint is for triage state only.
 */
export async function PATCH(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const blocked = await enforceAdminRateLimit("feedback.transition", me.userId);
  if (blocked) return blocked;

  const parsed = await parseRequestJson(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const { id, status } = parsed.data;

  try {
    const updated = await prisma.feedback.update({
      where: { id },
      data: { status },
    });
    writeAuditLog({
      action: `MODERATOR_FEEDBACK_${status}`,
      actorUserId: me.userId,
      targetType: "Feedback",
      targetId: id,
      metadata: { userId: updated.userId, category: updated.category },
      request: req,
    }).catch(logBackgroundError("admin.feedback.audit"));

    return NextResponse.json({
      ok: true,
      feedback: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch {
    return NextResponse.json({ error: "Feedback not found." }, { status: 404 });
  }
}
