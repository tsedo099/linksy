import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { billingCheckoutBodySchema } from "@/lib/schemas/api-bodies";
import {
  getStripe,
  resolvePriceConfig,
  stripeAutomaticTaxEnabled,
  stripeSecretKey,
} from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Creates a Stripe Checkout Session for the signed-in user. Client expects:
 *   POST /api/billing/checkout  { priceId, successPath?, cancelPath? }  →  { url }
 *
 * The client then `window.location.href = url` to redirect into Stripe.
 */
export async function POST(req: NextRequest) {
  if (!stripeSecretKey()) {
    return NextResponse.json(
      { error: "Stripe is not configured on the server.", code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const auth = await getUser(req);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseRequestJson(req, billingCheckoutBodySchema);
  if (!parsed.ok) return parsed.response;

  const priceCfg = resolvePriceConfig(parsed.data.priceId);
  if (!priceCfg) {
    return NextResponse.json(
      { error: "Unknown price.", code: "PRICE_NOT_ALLOWED" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, email: true, stripeCustomerId: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const origin = resolveOrigin(req);
  const successUrl = appendQuery(
    sameOriginUrl(origin, parsed.data.successPath ?? "/settings/billing?checkout=success"),
    "session_id",
    "{CHECKOUT_SESSION_ID}",
  );
  const cancelUrl = sameOriginUrl(origin, parsed.data.cancelPath ?? "/pricing?checkout=cancelled");
  const uiMode = parsed.data.uiMode ?? "hosted";

  const stripe = getStripe();
  try {
    const commonParams = {
      mode: "subscription" as const,
      line_items: [{ price: priceCfg.priceId, quantity: 1 }],
      ...(user.stripeCustomerId
        ? { customer: user.stripeCustomerId }
        : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { userId: user.id, tier: priceCfg.tier },
      subscription_data: {
        metadata: { userId: user.id, tier: priceCfg.tier },
      },
      // Automatic tax calculation. Off by default; flip
      // `STRIPE_AUTOMATIC_TAX=true` after registering tax IDs in
      // Stripe Dashboard. See `lib/stripe.ts:stripeAutomaticTaxEnabled`.
      automatic_tax: { enabled: stripeAutomaticTaxEnabled() },
      allow_promotion_codes: true,
    };

    const session =
      uiMode === "embedded"
        ? await stripe.checkout.sessions.create(
            {
              ...commonParams,
              // Stripe SDK type lists "embedded_page" / "hosted_page" but the
              // wire format still accepts "embedded" — the API + the embedded
              // checkout JS use that token. Cast at the boundary; runtime is
              // unaffected, this is purely the SDK type catching up.
              ui_mode: "embedded" as never,
              // Embedded mode uses `return_url` (no separate cancel — user
              // closes the modal). Stripe interpolates `{CHECKOUT_SESSION_ID}`.
              return_url: successUrl,
            },
            { idempotencyKey: `checkout:embedded:${user.id}:${priceCfg.priceId}:${minuteBucket()}` },
          )
        : await stripe.checkout.sessions.create(
            {
              ...commonParams,
              billing_address_collection: "auto",
              success_url: successUrl,
              cancel_url: cancelUrl,
            },
            { idempotencyKey: `checkout:hosted:${user.id}:${priceCfg.priceId}:${minuteBucket()}` },
          );

    if (uiMode === "embedded") {
      if (!session.client_secret) {
        throw new Error("Stripe returned an embedded session without a client_secret.");
      }
      return NextResponse.json({ clientSecret: session.client_secret, sessionId: session.id, uiMode: "embedded" });
    }

    if (!session.url) {
      throw new Error("Stripe returned a hosted session without a URL.");
    }
    return NextResponse.json({ url: session.url, sessionId: session.id, uiMode: "hosted" });
  } catch (err) {
    logger.error(
      { scope: "billing.checkout", userId: user.id, priceId: priceCfg.priceId, err: errPayload(err) },
      "stripe checkout session create failed",
    );
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 502 },
    );
  }
}

function resolveOrigin(req: NextRequest): string {
  const configured = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return req.nextUrl.origin;
}

function sameOriginUrl(origin: string, pathOrUrl: string): string {
  // Prevent open-redirect: only honor relative paths. If a full URL is passed,
  // ignore it and fall back to the configured origin + root.
  if (pathOrUrl.startsWith("/")) {
    return `${origin}${pathOrUrl}`;
  }
  return `${origin}/`;
}

function appendQuery(url: string, key: string, value: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${encodeURIComponent(key)}=${value}`;
}

function minuteBucket(): number {
  return Math.floor(Date.now() / 60_000);
}

function errPayload(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  return { message: String(err) };
}
