import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getStripe, stripeSecretKey } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Returns a Stripe Customer Portal session URL for the signed-in user.
 *
 * Setup: Stripe Dashboard → Customer Portal → enable it for this account.
 * Fallback: if `STRIPE_SECRET_KEY` is unset, the legacy `BILLING_PORTAL_URL`
 * env still works so dev environments without Stripe wired up can ship.
 */
export async function POST(req: NextRequest) {
  const auth = await getUser(req);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!stripeSecretKey()) {
    const staticUrl = process.env.BILLING_PORTAL_URL?.trim();
    if (staticUrl) return NextResponse.json({ url: staticUrl });
    return NextResponse.json(
      { error: "Billing portal is not configured on the server.", code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, email: true, stripeCustomerId: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const stripe = getStripe();

  // Provision a Stripe customer on demand for users who land in the portal
  // before completing a Checkout (e.g. to download invoices, manage tax IDs).
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    try {
      const customer = await stripe.customers.create(
        { email: user.email, metadata: { userId: user.id } },
        { idempotencyKey: `customer:${user.id}` },
      );
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    } catch (err) {
      logger.error(
        { scope: "billing.portal", userId: user.id, err: errPayload(err) },
        "stripe customer create failed",
      );
      return NextResponse.json(
        { error: "Could not open billing portal." },
        { status: 502 },
      );
    }
  }

  const origin = resolveOrigin(req);
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    logger.error(
      { scope: "billing.portal", userId: user.id, err: errPayload(err) },
      "stripe billing portal session create failed",
    );
    return NextResponse.json(
      { error: "Could not open billing portal." },
      { status: 502 },
    );
  }
}

function resolveOrigin(req: NextRequest): string {
  const configured = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return req.nextUrl.origin;
}

function errPayload(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  return { message: String(err) };
}
