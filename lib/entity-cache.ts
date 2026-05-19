import "server-only";
import { getSharedRedis } from "@/lib/redis";

const NS = "linksy:v1";

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** TTL seconds (env overrides). Only used when `REDIS_URL` is set. */
export const ENTITY_CACHE_TTL = {
  postDetail: () => envInt("CACHE_TTL_POST_DETAIL_SEC", 22),
  userProfile: () => envInt("CACHE_TTL_USER_PROFILE_SEC", 48),
} as const;

export function postDetailCacheKey(viewerId: string, postId: string) {
  return `${NS}:pd:${viewerId}:${postId}`;
}

export function userProfileCacheKey(viewerId: string, targetUserId: string) {
  return `${NS}:up:${viewerId}:${targetUserId}`;
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  const r = getSharedRedis();
  if (!r) return null;
  try {
    const s = await r.get(key);
    if (s == null) return null;
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJson(key: string, value: unknown, ttlSec: number): Promise<void> {
  const r = getSharedRedis();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(value), "EX", ttlSec);
  } catch {
    /* optional cache */
  }
}

export async function cacheDel(key: string): Promise<void> {
  const r = getSharedRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    /* ignore */
  }
}

export async function invalidatePostDetailViewer(viewerId: string, postId: string): Promise<void> {
  await cacheDel(postDetailCacheKey(viewerId, postId));
}

export async function invalidateUserProfileViewer(viewerId: string, targetUserId: string): Promise<void> {
  await cacheDel(userProfileCacheKey(viewerId, targetUserId));
}
