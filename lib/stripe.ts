import "server-only";

import Stripe from "stripe";
import type { SubscriptionTier } from "@/lib/generated/prisma/client";

/**
 * Stripe SDK client. Lazily constructed so app modules that never touch billing
 * (most routes) don't fail to import when STRIPE_SECRET_KEY isn't set in dev.
 */
let cached: Stripe | null = null;

export function stripeSecretKey(): string | null {
  return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = stripeSecretKey();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  cached = new Stripe(key, {
    appInfo: { name: "linksy", url: "https://linksy.app" },
    typescript: true,
  });
  return cached;
}

export function stripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

/**
 * Whether to enable Stripe Automatic Tax on Checkout sessions. Off by default
 * — merchants need to register tax IDs in Stripe Dashboard and confirm the
 * configuration is correct for their jurisdictions before turning this on.
 * Flip `STRIPE_AUTOMATIC_TAX=true` once that's done; no code change required.
 */
export function stripeAutomaticTaxEnabled(): boolean {
  const raw = process.env.STRIPE_AUTOMATIC_TAX?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

/**
 * Maps a Stripe Price ID → app subscription tier. Configured via env so the
 * same code works across dev/staging/prod without re-deploying.
 */
export interface PriceConfig {
  priceId: string;
  tier: SubscriptionTier;
  interval: "month" | "year";
  /** Display copy only — Stripe is the source of truth for charge amounts. */
  label: string;
}

/** Built once per process — env is read at import time, mirroring other modules. */
const PRICE_TABLE: PriceConfig[] = [
  envPrice("STRIPE_PRICE_PRO_MONTHLY", "PRO", "month", "Pro · Monthly"),
  envPrice("STRIPE_PRICE_PRO_YEARLY", "PRO", "year", "Pro · Yearly"),
].filter((p): p is PriceConfig => p !== null);

function envPrice(
  env: string,
  tier: SubscriptionTier,
  interval: "month" | "year",
  label: string,
): PriceConfig | null {
  const priceId = process.env[env]?.trim();
  if (!priceId) return null;
  return { priceId, tier, interval, label };
}

export function listConfiguredPrices(): PriceConfig[] {
  return [...PRICE_TABLE];
}

export function resolvePriceConfig(priceId: string): PriceConfig | null {
  return PRICE_TABLE.find((p) => p.priceId === priceId) ?? null;
}

/** Stripe statuses are kebab/snake-case strings; map to our enum names. */
export function mapStripeStatus(
  status: Stripe.Subscription.Status,
): "INCOMPLETE" | "INCOMPLETE_EXPIRED" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "UNPAID" | "PAUSED" {
  switch (status) {
    case "incomplete":
      return "INCOMPLETE";
    case "incomplete_expired":
      return "INCOMPLETE_EXPIRED";
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    case "paused":
      return "PAUSED";
  }
}

/** Stripe gives unix seconds; null when the field is unset. */
export function unixToDate(seconds: number | null | undefined): Date | null {
  if (seconds == null) return null;
  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}
