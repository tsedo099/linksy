import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isSafetyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { gdprHardDeleteGraceDays } from "@/lib/gdpr-hard-delete";
import { writeAuditLog } from "@/lib/audit-log";
import { logBackgroundError } from "@/lib/logger";
import { enforceAdminRateLimit, ADMIN_DESTRUCTIVE_LIMIT } from "@/lib/admin-rate-limit";
import { parseRequestJson } from "@/lib/request-json";
import { z } from "zod";

/**
 * GET /api/admin/deletion-requests
 *
 * Returns the queue of users who have requested account deletion via Settings
 * → Delete account (`User.accountDeletionRequestedAt` is set). The cron at
 * [/api/cron/hard-delete-users](app/api/cron/hard-delete-users/route.ts) purges
 * them once the grace window elapses; this admin view lets an operator see
 * who is in flight + when each row tips over.
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
  const cursor = searchParams.get("cursor")?.trim() || undefined;

  const graceDays = gdprHardDeleteGraceDays();
  const graceMs = graceDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const rows = await prisma.user.findMany({
    where: { accountDeletionRequestedAt: { not: null } },
    orderBy: [{ accountDeletionRequestedAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      avatarUrl: true,
      accountDeletionRequestedAt: true,
      createdAt: true,
      _count: { select: { posts: true, followers: true } },
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return NextResponse.json({
    graceDays,
    requests: items.map((u) => {
      const requestedAt = u.accountDeletionRequestedAt!;
      const purgeAt = new Date(requestedAt.getTime() + graceMs);
      const remainingMs = Math.max(0, purgeAt.getTime() - now);
      return {
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        email: u.email,
        avatarUrl: u.avatarUrl,
        accountCreatedAt: u.createdAt.toISOString(),
        requestedAt: requestedAt.toISOString(),
        purgeAt: purgeAt.toISOString(),
        remainingMs,
        overdue: remainingMs === 0,
        postCount: u._count.posts,
        followerCount: u._count.followers,
      };
    }),
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
  });
}

const patchSchema = z.object({
  userId: z.string().min(1),
  /** "cancel" → clears `accountDeletionRequestedAt`, restoring the account. */
  action: z.literal("cancel"),
  /** Short note recorded in the audit trail (e.g. "user reached out to support"). */
  note: z.string().max(500).optional(),
});

/**
 * PATCH /api/admin/deletion-requests — admin cancels a pending hard-delete.
 *
 * Sets `User.accountDeletionRequestedAt = null` so the cron skip the row and
 * the user can sign back in immediately. Idempotent: if the row is already
 * cleared we still return 200 with `{ ok: true, alreadyCleared: true }`.
 */
export async function PATCH(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const blocked = await enforceAdminRateLimit("deletion.cancel", me.userId, ADMIN_DESTRUCTIVE_LIMIT);
  if (blocked) return blocked;

  const parsed = await parseRequestJson(req, patchSchema);
  if (!parsed.ok) return parsed.response;
  const { userId, note } = parsed.data;

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, accountDeletionRequestedAt: true, username: true },
  });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (target.accountDeletionRequestedAt == null) {
    return NextResponse.json({ ok: true, alreadyCleared: true });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { accountDeletionRequestedAt: null },
  });

  writeAuditLog({
    action: "MODERATOR_DELETION_CANCEL",
    actorUserId: me.userId,
    targetType: "User",
    targetId: userId,
    metadata: {
      note: note ?? null,
      previousRequestedAt: target.accountDeletionRequestedAt.toISOString(),
      username: target.username,
    },
    request: req,
  }).catch(logBackgroundError("admin.deletion.cancel.audit"));

  return NextResponse.json({ ok: true });
}
