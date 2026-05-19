import "server-only";
import { getSharedRedis } from "@/lib/redis";

/**
 * Online-presence registry.
 *
 *   `markOnline(userId)` writes `presence:{userId}` to Redis with a 90s TTL.
 *   Clients ping `/api/presence/heartbeat` every 30s while connected — if
 *   they stop pinging the key expires automatically and the next presence
 *   query returns `online: false`. `markOffline(userId)` deletes the key so a
 *   `beforeunload` beacon flips the dot off immediately.
 *
 *   `lastSeen:{userId}` keeps the last heartbeat timestamp (no TTL) so we can
 *   render "last seen X ago" once the user goes offline.
 *
 * Process-local fallback (no `REDIS_URL`): an in-memory Map mirrors the same
 * semantics. Multi-instance fan-out requires Redis.
 */

export const PRESENCE_TTL_SECONDS = 90;

const PRESENCE_PREFIX = "presence:v1:";
const LAST_SEEN_PREFIX = "lastseen:v1:";

const memoryPresence = new Map<string, number>(); // userId → expiresAt
const memoryLastSeen = new Map<string, number>(); // userId → ts

function presenceKey(userId: string): string {
  return `${PRESENCE_PREFIX}${userId}`;
}
function lastSeenKey(userId: string): string {
  return `${LAST_SEEN_PREFIX}${userId}`;
}

export type PresenceState = {
  online: boolean;
  lastSeenAt: Date | null;
};

/**
 * Returns `{ wasOffline }` so callers can publish an `online` event only on
 * the first heartbeat in a window (avoids spamming subscribers every 30s).
 */
export async function markOnline(userId: string): Promise<{ wasOffline: boolean }> {
  const now = Date.now();
  const redis = getSharedRedis();

  if (redis) {
    try {
      // SET … NX EX 90 → returns "OK" only if key was new.
      const created = await redis.set(presenceKey(userId), "1", "EX", PRESENCE_TTL_SECONDS, "NX");
      if (!created) {
        // Already online — just refresh TTL.
        await redis.expire(presenceKey(userId), PRESENCE_TTL_SECONDS);
      }
      await redis.set(lastSeenKey(userId), String(now));
      return { wasOffline: created !== null };
    } catch {
      // Fall through to memory fallback.
    }
  }

  const prev = memoryPresence.get(userId);
  const wasOffline = !prev || prev <= now;
  memoryPresence.set(userId, now + PRESENCE_TTL_SECONDS * 1000);
  memoryLastSeen.set(userId, now);
  return { wasOffline };
}

export async function markOffline(userId: string): Promise<{ wasOnline: boolean }> {
  const now = Date.now();
  const redis = getSharedRedis();

  if (redis) {
    try {
      const deleted = await redis.del(presenceKey(userId));
      await redis.set(lastSeenKey(userId), String(now));
      return { wasOnline: deleted > 0 };
    } catch {
      // Fall through.
    }
  }

  const prev = memoryPresence.get(userId);
  const wasOnline = Boolean(prev && prev > now);
  memoryPresence.delete(userId);
  memoryLastSeen.set(userId, now);
  return { wasOnline };
}

export async function getPresence(userId: string): Promise<PresenceState> {
  const redis = getSharedRedis();

  if (redis) {
    try {
      const [exists, lastSeenRaw] = await Promise.all([
        redis.exists(presenceKey(userId)),
        redis.get(lastSeenKey(userId)),
      ]);
      const lastSeenMs = lastSeenRaw ? Number(lastSeenRaw) : NaN;
      return {
        online: exists === 1,
        lastSeenAt: Number.isFinite(lastSeenMs) ? new Date(lastSeenMs) : null,
      };
    } catch {
      // Fall through.
    }
  }

  const now = Date.now();
  const expiresAt = memoryPresence.get(userId) ?? 0;
  // Lazy GC of the memory map.
  if (expiresAt && expiresAt <= now) memoryPresence.delete(userId);
  const lastSeenMs = memoryLastSeen.get(userId);
  return {
    online: expiresAt > now,
    lastSeenAt: lastSeenMs ? new Date(lastSeenMs) : null,
  };
}
