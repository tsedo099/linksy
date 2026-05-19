import "server-only";
import { getSharedRedis } from "@/lib/redis";
import { logBackgroundError } from "@/lib/logger";

/**
 * DAU/MAU via Redis HyperLogLog. Two HLL keys are maintained per UTC day and
 * month — `dau:YYYY-MM-DD` and `mau:YYYY-MM` — and any signal that counts as
 * "active" (HTTP request, message sent, post created, story viewed) calls
 * {@link trackActiveUser}.
 *
 * HLL is bounded-memory (~12 KB per key for a 0.81% error rate) regardless of
 * unique user count, which is the only sane choice once you cross a few
 * hundred thousand daily users. We expire the keys with a generous tail so
 * `/api/admin/active-users` can answer "last 7 days" / "last 90 days" without
 * a separate write path.
 *
 * If Redis is not configured the tracker is a no-op — falling back to
 * read-only DB queries (`distinct userId from AuditLog within window`) is
 * fine for low-traffic dev but never for production hot path, so we keep that
 * out of this module.
 */

const DAU_TTL_SECONDS = 60 * 60 * 24 * 35; // 35 days
const MAU_TTL_SECONDS = 60 * 60 * 24 * 100; // 100 days

function utcDayKey(now: Date): string {
  return `dau:${now.toISOString().slice(0, 10)}`;
}
function utcMonthKey(now: Date): string {
  return `mau:${now.toISOString().slice(0, 7)}`;
}

/**
 * Record `userId` as active for the current UTC day + month. Fire-and-forget:
 * callers are typically on the hot request path, so this never blocks.
 */
export async function trackActiveUser(userId: string, now: Date = new Date()): Promise<void> {
  const redis = getSharedRedis();
  if (!redis) return;
  const dayKey = utcDayKey(now);
  const monthKey = utcMonthKey(now);
  try {
    const pipeline = redis.pipeline();
    pipeline.pfadd(dayKey, userId);
    pipeline.expire(dayKey, DAU_TTL_SECONDS);
    pipeline.pfadd(monthKey, userId);
    pipeline.expire(monthKey, MAU_TTL_SECONDS);
    await pipeline.exec();
  } catch (err) {
    logBackgroundError("active-users.track")(err);
  }
}

/** Approximate active-user count for the UTC day containing `at`. */
export async function dauForDay(at: Date = new Date()): Promise<number | null> {
  const redis = getSharedRedis();
  if (!redis) return null;
  try {
    return await redis.pfcount(utcDayKey(at));
  } catch {
    return null;
  }
}

/** Approximate active-user count for the UTC month containing `at`. */
export async function mauForMonth(at: Date = new Date()): Promise<number | null> {
  const redis = getSharedRedis();
  if (!redis) return null;
  try {
    return await redis.pfcount(utcMonthKey(at));
  } catch {
    return null;
  }
}

/**
 * Approximate unique active users across the trailing `days` UTC days (inclusive
 * of today). Uses `PFCOUNT key1 key2 …` which Redis merges into a single HLL
 * union in O(N) of register count, not user count.
 */
export async function activeUsersTrailing(days: number, now: Date = new Date()): Promise<number | null> {
  const redis = getSharedRedis();
  if (!redis) return null;
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(utcDayKey(d));
  }
  try {
    return await redis.pfcount(...keys);
  } catch {
    return null;
  }
}
