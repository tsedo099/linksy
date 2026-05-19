import { NextResponse } from "next/server";
import { listConfiguredPrices, stripeSecretKey, stripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * GET /api/billing/status — public probe so the billing UI can hide the
 * upgrade buttons (and show a "Payments coming soon" placeholder) when
 * Stripe isn't configured on the server. No secrets are returned —
 * only booleans + the public price-ids the UI already needs.
 */
export async function GET() {
  const secret = stripeSecretKey();
  const webhook = stripeWebhookSecret();
  const prices = listConfiguredPrices();

  return NextResponse.json({
    configured: Boolean(secret),
    webhookConfigured: Boolean(webhook),
    priceCount: prices.length,
    prices: prices.map((p) => ({ priceId: p.priceId, tier: p.tier, interval: p.interval, label: p.label })),
  });
}
