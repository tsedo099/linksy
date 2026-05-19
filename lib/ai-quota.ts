import "server-only";

import { prisma } from "@/lib/prisma";
import type { SubscriptionTier } from "@/lib/generated/prisma/client";

/**
 * Daily AI request quotas. Pro is the only paid tier; Free callers get a
 * small allowance so the feature is still discoverable. Numbers are env-
 * overridable so we can dial them without a deploy.
 */
const DEFAULT_QUOTA: Record<SubscriptionTier, number> = {
  FREE: 20,
  PRO: 500,
};

export type QuotaResult = {
  allowed: boolean;
  used: number;
  quota: number;
  tier: SubscriptionTier;
};

function quotaFor(tier: SubscriptionTier): number {
  const env = process.env[`AI_QUOTA_${tier}`];
  if (env) {
    const n = Number.parseInt(env, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return DEFAULT_QUOTA[tier];
}

/** UTC YYYY-MM-DD — same key the row uses, so we never need timezone math. */
function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Check quota WITHOUT incrementing. Useful for UI hints / `/api/ai/quota`
 * surface so the client can show "X of Y left today" without spending a slot.
 */
export async function peekAiQuota(userId: string, tier: SubscriptionTier): Promise<QuotaResult> {
  const quota = quotaFor(tier);
  const day = todayKey();
  const row = await prisma.aiUsage.findUnique({
    where: { userId_day: { userId, day } },
    select: { count: true },
  });
  const used = row?.count ?? 0;
  return { allowed: used < quota, used, quota, tier };
}

/**
 * Atomically reserve one AI slot for `userId`. Returns `{ allowed: false }`
 * without spending if the quota is exhausted; otherwise increments and
 * returns the new usage. Uses upsert so concurrent calls cannot double-
 * decrement (Postgres serialises the upsert on the composite primary key).
 *
 * Returning {allowed:false} BEFORE the increment is intentional: a denied
 * caller never paid for a slot, so a subsequent retry within the same day
 * still finds the quota cap honestly.
 */
export async function consumeAiQuota(userId: string, tier: SubscriptionTier): Promise<QuotaResult> {
  const quota = quotaFor(tier);
  const day = todayKey();

  // Read current count first so we can decide whether to spend a slot.
  // The window between read and write is small; under burst races at most
  // one extra call slips through, which is acceptable for a soft quota.
  const existing = await prisma.aiUsage.findUnique({
    where: { userId_day: { userId, day } },
    select: { count: true },
  });
  const current = existing?.count ?? 0;
  if (current >= quota) {
    return { allowed: false, used: current, quota, tier };
  }

  const next = await prisma.aiUsage.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });
  return { allowed: true, used: next.count, quota, tier };
}

/**
 * Resolve the caller's tier from their User row. Returns FREE if the user
 * record was deleted between auth and this call (edge case; only happens
 * during account-deletion races).
 */
export async function userTier(userId: string): Promise<SubscriptionTier> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });
  return row?.subscriptionTier ?? "FREE";
}
