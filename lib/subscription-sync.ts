import "server-only";

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  mapStripeStatus,
  resolvePriceConfig,
  unixToDate,
} from "@/lib/stripe";
import type { SubscriptionTier } from "@/lib/generated/prisma/client";

/**
 * Statuses where the user is entitled to their paid tier. Stripe also pauses
 * subscriptions with `status=paused` mid-cycle; treat them as inactive
 * since the customer is not currently being billed.
 */
const ACTIVE_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing"]);

/** Look up our user record from the Stripe customer or `userId` metadata. */
export async function findUserIdForStripeSubscription(
  sub: Stripe.Subscription,
): Promise<string | null> {
  const metaUserId =
    typeof sub.metadata?.userId === "string" && sub.metadata.userId.trim()
      ? sub.metadata.userId.trim()
      : null;
  if (metaUserId) {
    const exists = await prisma.user.findUnique({ where: { id: metaUserId }, select: { id: true } });
    if (exists) return exists.id;
  }

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;

  const byCustomer = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return byCustomer?.id ?? null;
}

interface PrimaryItem {
  priceId: string | null;
  tier: SubscriptionTier;
}

function primaryItem(sub: Stripe.Subscription): PrimaryItem {
  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const cfg = priceId ? resolvePriceConfig(priceId) : null;
  // Unknown price → fall back to PRO so the user is not silently locked out;
  // operators can fix the env mapping without a code deploy.
  return { priceId, tier: cfg?.tier ?? "PRO" };
}

/**
 * Idempotent upsert of a Stripe `Subscription` into our DB. Returns the user
 * we synced for so callers can clear caches if needed.
 */
export async function applyStripeSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const userId = await findUserIdForStripeSubscription(sub);
  if (!userId) {
    logger.warn(
      { scope: "subscription.sync", subscriptionId: sub.id, customerId: stringifyCustomer(sub.customer) },
      "stripe subscription event has no matching user",
    );
    return null;
  }

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  const status = mapStripeStatus(sub.status);
  const { priceId, tier } = primaryItem(sub);
  const isActive = ACTIVE_STATUSES.has(sub.status);
  const effectiveTier: SubscriptionTier = isActive ? tier : "FREE";

  // `current_period_*` live on the subscription item once the schedule renders,
  // otherwise on the subscription itself (older SDKs).
  const item = sub.items.data[0];
  const currentPeriodStart =
    unixToDate(item?.current_period_start) ??
    unixToDate((sub as unknown as { current_period_start?: number | null }).current_period_start);
  const currentPeriodEnd =
    unixToDate(item?.current_period_end) ??
    unixToDate((sub as unknown as { current_period_end?: number | null }).current_period_end);

  await prisma.$transaction(async (tx) => {
    await tx.subscription.upsert({
      where: { userId },
      create: {
        userId,
        tier: effectiveTier,
        status,
        expiresAt: currentPeriodEnd,
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        canceledAt: unixToDate(sub.canceled_at),
        trialEnd: unixToDate(sub.trial_end),
      },
      update: {
        tier: effectiveTier,
        status,
        expiresAt: currentPeriodEnd,
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
        canceledAt: unixToDate(sub.canceled_at),
        trialEnd: unixToDate(sub.trial_end),
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        subscriptionTier: effectiveTier,
        isPro: effectiveTier !== "FREE",
        // Keep the customer ID in sync — the very first webhook may be the
        // first place we learn about it.
        ...(customerId ? { stripeCustomerId: customerId } : {}),
      },
    });
  });

  return userId;
}

/** Called from `customer.subscription.deleted` — Stripe fired final downgrade. */
export async function clearStripeSubscriptionFromUser(sub: Stripe.Subscription): Promise<void> {
  const userId = await findUserIdForStripeSubscription(sub);
  if (!userId) return;

  await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { userId, stripeSubscriptionId: sub.id },
      data: {
        tier: "FREE",
        status: "CANCELED",
        cancelAtPeriodEnd: false,
        canceledAt: unixToDate(sub.canceled_at) ?? new Date(),
        expiresAt: unixToDate(sub.ended_at) ?? new Date(),
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: { subscriptionTier: "FREE", isPro: false },
    });
  });
}

function stringifyCustomer(c: Stripe.Subscription["customer"]): string | null {
  if (!c) return null;
  return typeof c === "string" ? c : c.id;
}
