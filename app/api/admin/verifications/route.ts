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
 * GET /api/admin/verifications — paginated queue of `VerificationRequest`s.
 *
 * Status filter: `?status=PENDING` (default) | `APPROVED` | `REJECTED` | `ALL`.
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const statusFilter = (searchParams.get("status") ?? "PENDING").toUpperCase();
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));

  const rows = await prisma.verificationRequest.findMany({
    where: statusFilter === "ALL" ? {} : { status: statusFilter as "PENDING" | "APPROVED" | "REJECTED" },
    orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
    take: limit,
    include: {
      user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      decidedBy: { select: { id: true, username: true, displayName: true } },
    },
  });

  return NextResponse.json({
    requests: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      category: r.category,
      reason: r.reason,
      supportingUrls: r.supportingUrls,
      status: r.status,
      submittedAt: r.submittedAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decisionNote: r.decisionNote,
      user: r.user,
      decidedBy: r.decidedBy,
    })),
  });
}

const patchSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(1000).optional(),
});

/**
 * PATCH /api/admin/verifications — approve or reject a verification request.
 *
 * On approve: flips `User.isVerified` true, marks request APPROVED.
 * On reject:  marks request REJECTED (does not touch user.isVerified).
 *
 * Body: `{ id, decision: "APPROVED" | "REJECTED", note? }`. Idempotent on
 * status (re-approve / re-reject is a no-op once decided).
 */
export async function PATCH(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const blocked = await enforceAdminRateLimit("verification.decide", me.userId);
  if (blocked) return blocked;

  const parsed = await parseRequestJson(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const { id, decision, note } = parsed.data;

  const existing = await prisma.verificationRequest.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Verification request not found." }, { status: 404 });
  }
  if (existing.status !== "PENDING") {
    return NextResponse.json(
      { error: `Already ${existing.status.toLowerCase()}.` },
      { status: 409 },
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.verificationRequest.update({
      where: { id },
      data: {
        status: decision,
        decidedAt: new Date(),
        decidedById: me.userId,
        decisionNote: note ?? null,
      },
    });
    if (decision === "APPROVED") {
      await tx.user.update({
        where: { id: existing.userId },
        data: { isVerified: true },
      });
    }
    return r;
  });

  writeAuditLog({
    action: `MODERATOR_VERIFICATION_${decision}`,
    actorUserId: me.userId,
    targetType: "VerificationRequest",
    targetId: id,
    metadata: { userId: existing.userId, category: existing.category, note: note ?? null },
    request: req,
  }).catch(logBackgroundError("admin.verification.audit"));

  return NextResponse.json({
    ok: true,
    request: {
      ...updated,
      submittedAt: updated.submittedAt.toISOString(),
      decidedAt: updated.decidedAt?.toISOString() ?? null,
    },
  });
}
