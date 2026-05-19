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

/**
 * One-direction variant: only users *I* have explicitly blocked. Used for
 * UI filtering on the blocker's side (hiding their own conversation with
 * the blocked party). The bidirectional `getBlockedUserIds` is correct for
 * cross-user content hiding (feed posts, notifications), but using it to
 * filter inbox / chat lists leaks the block to the blocked party — their
 * conversation would vanish the moment we add the row, which is exactly
 * how they'd realise they got blocked.
 */
const blockedByMeCache = new Map<string, CacheEntry>();
export async function getBlockedByMeIds(userId: string) {
  const now = Date.now();
  const hit = blockedByMeCache.get(userId);
  if (hit && hit.expiresAt > now) return hit.ids;

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "blockedId" AS "id"
    FROM "UserBlock"
    WHERE "blockerId" = ${userId}
  `;
  const ids = rows.map((row) => row.id);
  blockedByMeCache.set(userId, { ids, expiresAt: now + BLOCKED_CACHE_TTL_MS });
  return ids;
}

/** Drop both sides of a block from the cache after a write. */
export function invalidateBlockedUserIdsCache(...userIds: string[]) {
  for (const id of userIds) {
    blockedCache.delete(id);
    blockedByMeCache.delete(id);
  }
}
