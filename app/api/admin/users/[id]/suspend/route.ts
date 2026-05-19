import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isSafetyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { logBackgroundError } from "@/lib/logger";
import { parseRequestJson } from "@/lib/request-json";
import { enforceAdminRateLimit, ADMIN_DESTRUCTIVE_LIMIT } from "@/lib/admin-rate-limit";
import { z } from "zod";

const SUSPEND_MAX_DAYS = 365;

const postSchema = z.object({
  /** Days until the suspension expires. Capped at 365 to prevent "forever" misuse — re-suspend if needed. */
  days: z.number().int().min(1).max(SUSPEND_MAX_DAYS),
  /** Short note shown to the user on the suspension banner. */
  reason: z.string().min(1).max(500),
});

/**
 * POST /api/admin/users/[id]/suspend — apply / extend an account suspension.
 *
 * Body: `{ days, reason }`. Sets `User.suspendedUntil = now + days`,
 * `User.suspendedReason`, `User.suspendedByUserId = me`. `lib/auth.ts:getUser`
 * checks `suspendedUntil` on every request → suspended user is treated as
 * signed-out (banner explains it on the login screen via cookie marker).
 *
 * Re-calling extends the suspension to the new expiry (max-of would let an
 * admin shorten their own peer's suspension; replacing is the simpler rule —
 * audit log captures both old + new).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const blocked = await enforceAdminRateLimit("user.suspend", me.userId, ADMIN_DESTRUCTIVE_LIMIT);
  if (blocked) return blocked;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "User id is required." }, { status: 400 });
  if (id === me.userId) {
    return NextResponse.json({ error: "You can't suspend yourself." }, { status: 400 });
  }

  const parsed = await parseRequestJson(req, postSchema);
  if (!parsed.ok) return parsed.response;
  const { days, reason } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, suspendedUntil: true, suspendedReason: true },
  });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const previousUntil = target.suspendedUntil;
  const suspendedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id },
    data: {
      suspendedUntil,
      suspendedReason: reason,
      suspendedByUserId: me.userId,
    },
  });
  const { invalidateUserStatusCache } = await import("@/lib/auth");
  invalidateUserStatusCache(id);

  writeAuditLog({
    action: "MODERATOR_USER_SUSPEND",
    actorUserId: me.userId,
    targetType: "User",
    targetId: id,
    metadata: {
      days,
      reason,
      suspendedUntil: suspendedUntil.toISOString(),
      previousUntil: previousUntil?.toISOString() ?? null,
      previousReason: target.suspendedReason ?? null,
    },
    request: req,
  }).catch(logBackgroundError("admin.user.suspend.audit"));

  return NextResponse.json({
    ok: true,
    suspendedUntil: suspendedUntil.toISOString(),
    reason,
  });
}

/**
 * DELETE /api/admin/users/[id]/suspend — lift the active suspension.
 *
 * Clears `suspendedUntil` immediately so the user can sign in again. Keeps
 * `suspendedReason` + `suspendedByUserId` for audit history (overwritten on
 * next suspend).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const blocked = await enforceAdminRateLimit("user.unsuspend", me.userId, ADMIN_DESTRUCTIVE_LIMIT);
  if (blocked) return blocked;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "User id is required." }, { status: 400 });

  await prisma.user.update({
    where: { id },
    data: { suspendedUntil: null },
  });
  const { invalidateUserStatusCache } = await import("@/lib/auth");
  invalidateUserStatusCache(id);

  writeAuditLog({
    action: "MODERATOR_USER_UNSUSPEND",
    actorUserId: me.userId,
    targetType: "User",
    targetId: id,
    metadata: null,
    request: req,
  }).catch(logBackgroundError("admin.user.unsuspend.audit"));

  return NextResponse.json({ ok: true });
}
