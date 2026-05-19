import { getSharedRedis } from "@/lib/redis";

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

/** Prisma-backed limits (email verification sends, password-reset token rows). */
export const EMAIL_VERIFICATION_SEND_LIMIT = {
  windowMs: 60 * 60 * 1000,
  maxAttempts: 5,
} as const;

export const PASSWORD_RESET_ISSUE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 3,
} as const;

/** Auth login — many accounts from one IP (consumeRateLimit). */
export const AUTH_LOGIN_IP_LIMIT = {
  windowMs: 15 * 60 * 1000,
  max: 40,
} as const;

/** Auth login — same email/username field (consumeRateLimit). */
export const AUTH_LOGIN_IDENTIFIER_LIMIT = {
  windowMs: 60 * 1000,
  max: 5,
} as const;

/** Safe Social moderate-preview is fired on every keystroke — keep generous, but bounded. */
export const SAFETY_PREVIEW_LIMIT = {
  windowMs: 60 * 1000,
  max: 120,
} as const;

/** Safe Social status endpoint — cached on UI, but still cap per user. */
export const SAFETY_STATUS_LIMIT = {
  windowMs: 60 * 1000,
  max: 30,
} as const;

const memoryBuckets = new Map<string, number[]>();

function bucketKey(namespace: string, subject: string) {
  return `${namespace}:${subject}`;
}

function retryAfterFromOldest(timestamps: number[], windowMs: number, now: number): number {
  if (timestamps.length === 0) return Math.max(1, Math.ceil(windowMs / 1000));
  const oldest = Math.min(...timestamps);
  return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
}

/** Process-local sliding window (same semantics as the old digest-now Map). */
export function consumeMemorySlidingWindow(
  namespace: string,
  subject: string,
  opts: { windowMs: number; max: number },
): RateLimitResult {
  const key = bucketKey(namespace, subject);
  const now = Date.now();
  const minTs = now - opts.windowMs;
  const trimmed = (memoryBuckets.get(key) ?? []).filter((ts) => ts > minTs);

  if (trimmed.length >= opts.max) {
    memoryBuckets.set(key, trimmed);
    return {
      ok: false,
      retryAfterSeconds: retryAfterFromOldest(trimmed, opts.windowMs, now),
    };
  }

  trimmed.push(now);
  memoryBuckets.set(key, trimmed);
  return { ok: true };
}

const RATE_FW_PREFIX = "ratelimit:fw:v1";

/** Fixed window in Redis — works across app instances when `REDIS_URL` is set. */
export async function consumeRedisFixedWindow(
  namespace: string,
  subject: string,
  opts: { windowMs: number; max: number },
): Promise<RateLimitResult | null> {
  const redis = getSharedRedis();
  if (!redis) return null;

  const now = Date.now();
  const slice = Math.floor(now / opts.windowMs);
  const key = `${RATE_FW_PREFIX}:${namespace}:${subject}:${slice}`;

  try {
    const n = await redis.incr(key);
    if (n === 1) {
      await redis.pexpire(key, opts.windowMs + 1000);
    }
    if (n > opts.max) {
      const pttl = await redis.pttl(key);
      const retryAfterSeconds = pttl > 0 ? Math.ceil(pttl / 1000) : Math.ceil(opts.windowMs / 1000);
      return { ok: false, retryAfterSeconds };
    }
    return { ok: true };
  } catch {
    return null;
  }
}

/** Prefer Redis fixed window; fall back to in-memory sliding window. */
export async function consumeRateLimit(
  namespace: string,
  subject: string,
  opts: { windowMs: number; max: number },
): Promise<RateLimitResult> {
  const redisResult = await consumeRedisFixedWindow(namespace, subject, opts);
  if (redisResult !== null) return redisResult;
  return consumeMemorySlidingWindow(namespace, subject, opts);
}
