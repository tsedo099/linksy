import Redis from "ioredis";

let redis: Redis | null = null;

export function getSharedRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    redis = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
    redis.on("error", () => { /* silent — Redis is optional */ });
    return redis;
  } catch {
    return null;
  }
}

export const RedisKeys = {
  weeklyBoard: (category?: string) => `rank:weekly:${category ?? "global"}`,
  dailyXPCap:  (userId: string, action: string) => {
    const d = new Date().toISOString().slice(0, 10);
    return `xp:cap:${userId}:${action}:${d}`;
  },
};

const XP_DAILY_CAPS: Record<string, number> = {
  POST_CREATED:     5,
  LIKE_RECEIVED:    50,
  COMMENT_RECEIVED: 20,
  DAILY_LOGIN:      1,
  FOLLOW_RECEIVED:  20,
};

export async function checkAndIncrDailyCap(
  userId: string,
  action: string,
): Promise<boolean> {
  const r = getSharedRedis();
  const cap = XP_DAILY_CAPS[action] ?? 10;
  if (!r) return true; // no redis → allow

  const key = RedisKeys.dailyXPCap(userId, action);
  try {
    const val = await r.incr(key);
    if (val === 1) {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setUTCHours(24, 0, 0, 0);
      await r.expireat(key, Math.floor(midnight.getTime() / 1000));
    }
    return val <= cap;
  } catch {
    return true;
  }
}

export async function incrLeaderboard(userId: string, amount: number, category?: string) {
  const r = getSharedRedis();
  if (!r) return;
  try {
    const key = RedisKeys.weeklyBoard(category);
    await r.zincrby(key, amount, userId);
    const globalKey = RedisKeys.weeklyBoard();
    if (category && globalKey !== key) await r.zincrby(globalKey, amount, userId);
  } catch { /* ignore */ }
}

export async function getLeaderboard(
  category?: string,
  limit = 50,
): Promise<{ userId: string; score: number }[]> {
  const r = getSharedRedis();
  if (!r) return [];
  try {
    const key = RedisKeys.weeklyBoard(category);
    const rows = await r.zrevrange(key, 0, limit - 1, "WITHSCORES");
    const result: { userId: string; score: number }[] = [];
    for (let i = 0; i < rows.length; i += 2) {
      const userId = rows[i];
      const scoreRaw = rows[i + 1];
      if (userId === undefined || scoreRaw === undefined) continue;
      result.push({ userId, score: parseFloat(scoreRaw) });
    }
    return result;
  } catch {
    return [];
  }
}

export async function getUserRank(userId: string, category?: string): Promise<number | null> {
  const r = getSharedRedis();
  if (!r) return null;
  try {
    const key = RedisKeys.weeklyBoard(category);
    const rank = await r.zrevrank(key, userId);
    return rank !== null ? rank + 1 : null;
  } catch {
    return null;
  }
}
