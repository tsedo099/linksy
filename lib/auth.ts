import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { Prisma } from "@/lib/generated/prisma/client";
import { verifyAccessToken, type JwtPayload } from "@/lib/jwt";
import {
  LINKSY_ACCESS_COOKIE,
  LINKSY_REFRESH_COOKIE,
  applyAuthCookiesToStore,
  clearAuthCookiesOnStore,
} from "@/lib/auth-cookies";
import { prisma } from "@/lib/prisma";
import { rotateRefreshGrantAccess } from "@/lib/refresh-session";

/** Sync: valid access JWT only (no silent refresh). */
export function getUserFromAccessCookie(req: NextRequest): JwtPayload | null {
  const token = req.cookies.get(LINKSY_ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

function hasAuthCookie(req: NextRequest): boolean {
  return Boolean(
    req.cookies.get(LINKSY_ACCESS_COOKIE)?.value ||
      req.cookies.get(LINKSY_REFRESH_COOKIE)?.value,
  );
}

async function clearStaleAuthCookies(req: NextRequest): Promise<void> {
  if (!hasAuthCookie(req)) return;
  const cookieStore = await cookies();
  clearAuthCookiesOnStore(cookieStore);
}

/**
 * Per-instance cache of the User-status row keyed by `userId`. Every API
 * Route Handler calls `getUser` → `prisma.user.findUnique` to confirm the
 * account isn't deleted/suspended. The actual {accountDeletionRequestedAt,
 * suspendedUntil} pair barely changes (only when the user requests delete
 * or an admin suspends), so a short TTL caches it across the storm of
 * polled requests a single page generates. A new login still hits the DB
 * (different access token, same cache key — but the lookup is cheap).
 *
 * Invalidate explicitly when one of the cached fields is mutated (admin
 * suspend, account-delete request, restore). The cache is per serverless
 * instance — drift across instances is bounded by USER_STATUS_TTL_MS.
 */
const USER_STATUS_TTL_MS = 15_000;
type UserStatusRow = { accountDeletionRequestedAt: Date | null; suspendedUntil: Date | null };
type UserStatusEntry = { row: UserStatusRow | null; expiresAt: number };
const userStatusCache = new Map<string, UserStatusEntry>();

export function invalidateUserStatusCache(userId: string) {
  userStatusCache.delete(userId);
}

async function loadUserStatus(userId: string): Promise<UserStatusRow | null> {
  const now = Date.now();
  const hit = userStatusCache.get(userId);
  if (hit && hit.expiresAt > now) return hit.row;

  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountDeletionRequestedAt: true, suspendedUntil: true },
  });
  userStatusCache.set(userId, { row, expiresAt: now + USER_STATUS_TTL_MS });
  return row;
}

/**
 * Resolves the current user for API Route Handlers: verifies short-lived access JWT,
 * otherwise rotates refresh token + re-sets cookies via `cookies()` when valid.
 */
export async function getUser(req: NextRequest): Promise<JwtPayload | null> {
  const access = req.cookies.get(LINKSY_ACCESS_COOKIE)?.value;
  const fromAccess = access ? verifyAccessToken(access) : null;
  if (fromAccess) {
    try {
      const row = await loadUserStatus(fromAccess.userId);
      if (!row || row.accountDeletionRequestedAt != null) {
        await clearStaleAuthCookies(req);
        return null;
      }
      // Active admin suspension → treat as signed-out. Cookies stay so the
      // suspension banner page can still tell the user what happened on the
      // next request without forcing a re-login after the suspension lifts.
      if (row.suspendedUntil && row.suspendedUntil.getTime() > Date.now()) {
        return null;
      }
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2022") {
        throw err;
      }
    }
    Sentry.setUser({ id: fromAccess.userId });
    return fromAccess;
  }

  const refresh = req.cookies.get(LINKSY_REFRESH_COOKIE)?.value;
  if (!refresh) {
    await clearStaleAuthCookies(req);
    return null;
  }

  const rotated = await rotateRefreshGrantAccess(refresh);
  if (!rotated) {
    await clearStaleAuthCookies(req);
    return null;
  }

  const cookieStore = await cookies();
  applyAuthCookiesToStore(cookieStore, rotated.accessJwt, rotated.refreshRaw);

  Sentry.setUser({ id: rotated.payload.userId });
  return rotated.payload;
}
