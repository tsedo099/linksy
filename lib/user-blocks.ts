import { prisma } from "@/lib/prisma";

export async function areUsersBlocked(userId: string, targetId: string) {
  if (userId === targetId) return false;

  const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1
      FROM "UserBlock"
      WHERE ("blockerId" = ${userId} AND "blockedId" = ${targetId})
         OR ("blockerId" = ${targetId} AND "blockedId" = ${userId})
    ) AS "exists"
  `;

  return Boolean(rows[0]?.exists);
}

/**
 * Per-instance in-memory cache. Block lists change on the order of
 * minutes/hours, not requests — caching for 30s per viewer eliminates a
 * round trip on every feed/stories/notifications hit. Each serverless
 * instance has its own Map; that's fine because the cache is only a
 * latency optimization, not a source of truth.
 *
 * Call `invalidateBlockedUserIdsCache(userId)` from any write path
 * (block / unblock) so the next read picks up the new state.
 */
const BLOCKED_CACHE_TTL_MS = 30_000;
type CacheEntry = { ids: string[]; expiresAt: number };
const blockedCache = new Map<string, CacheEntry>();

export async function getBlockedUserIds(userId: string) {
  const now = Date.now();
  const hit = blockedCache.get(userId);
  if (hit && hit.expiresAt > now) return hit.ids;

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "blockedId" AS "id"
    FROM "UserBlock"
    WHERE "blockerId" = ${userId}
    UNION
    SELECT "blockerId" AS "id"
    FROM "UserBlock"
    WHERE "blockedId" = ${userId}
  `;

  const ids = rows.map((row) => row.id);
  blockedCache.set(userId, { ids, expiresAt: now + BLOCKED_CACHE_TTL_MS });
  return ids;
}

/** Drop both sides of a block from the cache after a write. */
export function invalidateBlockedUserIdsCache(...userIds: string[]) {
  for (const id of userIds) blockedCache.delete(id);
}
