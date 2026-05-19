import "server-only";
import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit";

/**
 * Per-admin / per-action rate limit. Wraps the shared `consumeRateLimit`
 * helper with sensible "an admin can't accidentally nuke the platform"
 * defaults: 60 writes per minute per admin per action namespace.
 *
 * Two tiers:
 *   - `ADMIN_WRITE_LIMIT`  — default per-action limit (60/min). Bulk panels
 *     and triage actions use this.
 *   - `ADMIN_DESTRUCTIVE_LIMIT` — tighter cap for irreversible actions like
 *     `MODERATOR_USER_SUSPEND` / hard delete (10/min).
 *
 * The limiter is keyed on `admin:<namespace>:<adminId>`, so two admins
 * working in parallel don't contend with each other.
 *
 * Returns the 429 NextResponse directly when blocked, so route handlers
 * can early-return without a custom branch:
 *
 *   const blocked = await enforceAdminRateLimit("report.transition", me.userId);
 *   if (blocked) return blocked;
 */

export const ADMIN_WRITE_LIMIT = { windowMs: 60_000, max: 60 } as const;
export const ADMIN_DESTRUCTIVE_LIMIT = { windowMs: 60_000, max: 10 } as const;

export async function enforceAdminRateLimit(
  action: string,
  adminUserId: string,
  opts: { windowMs: number; max: number } = ADMIN_WRITE_LIMIT,
): Promise<NextResponse | null> {
  const result = await consumeRateLimit(`admin:${action}`, adminUserId, opts);
  if (result.ok) return null;
  return NextResponse.json(
    {
      error: "Too many admin actions — slow down.",
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    },
  );
}
