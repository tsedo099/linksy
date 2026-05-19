import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Permission check for moderator / admin actions.
 *
 * Two sources of truth, evaluated in order:
 *   1. **DB column** `User.role` — `ADMIN` or `MODERATOR`. This is the
 *      production source once the platform is running.
 *   2. **Env allow-list** `SAFETY_ADMIN_USER_IDS` (comma-separated `User.id`).
 *      Kept as a bootstrap fallback so a fresh deploy can promote its very
 *      first admin without an existing admin already in the DB. Remove the
 *      env after the role column is backfilled in production.
 *
 * Fails closed: returns `false` on any error (DB outage etc) so admin
 * endpoints are unreachable, not accidentally open.
 */
export async function isSafetyAdmin(userId: string): Promise<boolean> {
  // DB check (the production path).
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (row?.role === "ADMIN" || row?.role === "MODERATOR") return true;
  } catch {
    // Fall through to env check — DB hiccup shouldn't lock out a bootstrap
    // admin from rescuing the platform.
  }

  // Bootstrap env fallback.
  const raw = process.env.SAFETY_ADMIN_USER_IDS?.trim();
  if (!raw) return false;
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(userId);
}

/**
 * Synchronous variant used by serverless cold-start paths that can't await
 * (e.g. middleware). Only consults the env allow-list — admin role check
 * happens inside the route handler instead.
 */
export function isSafetyAdminEnvOnly(userId: string): boolean {
  const raw = process.env.SAFETY_ADMIN_USER_IDS?.trim();
  if (!raw) return false;
  const allowed = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return allowed.includes(userId);
}
