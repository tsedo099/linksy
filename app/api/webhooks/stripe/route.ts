import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@/lib/generated/prisma/client";
import { logBackgroundError, logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getStripe, stripeWebhookSecret } from "@/lib/stripe";
import {
  applyStripeSubscription,
  clearStripeSubscriptionFromUser,
  findUserIdForStripeSubscription,
} from "@/lib/subscription-sync";
import { sendBillingReceiptEmail } from "@/lib/email-templates";

export const runtime = "nodejs";
/** Stripe signs raw body bytes — disable the route cache so Next never replays. */
export const dynamic = "force-dynamic";

/**
 * Stripe Billing webhook endpoint.
 *
 * Configure in dashboard:
 *   Dashboard → Developers → Webhooks → `/api/webhooks/stripe`
 *   Copy signing secret into `STRIPE_WEBHOOK_SECRET` (`whsec_...`).
 *
 * Required events:
 *   - checkout.session.completed
 *   - customer.subscription.created
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *   - customer.subscription.trial_will_end
 *   - invoice.payment_succeeded
 *   - invoice.payment_failed
 */
export async function POST(req: NextRequest) {
  const secret = stripeWebhookSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Stripe webhooks are not configured.", code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  const stripeSignature = req.headers.get("stripe-signature");
  if (!stripeSignature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, stripeSignature, secret);
  } catch (err) {
    logger.warn(
      { scope: "webhook.stripe", reason: err instanceof Error ? err.message : "unknown" },
      "stripe webhook signature rejected",
    );
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  // Idempotency: insert event ID first; unique-violation means duplicate.
  try {
    await prisma.processedWebhookEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      logger.info(
        { scope: "webhook.stripe", type: event.type, id: event.id },
        "stripe webhook already processed",
      );
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw err;
  }

  try {
    await dispatchEvent(event);
  } catch (err) {
    // Delete the idempotency row so Stripe can retry — otherwise the next
    // delivery would be silently skipped as a "duplicate".
    await prisma.processedWebhookEvent
      .delete({ where: { id: event.id } })
      .catch(() => undefined);
    logger.error(
      { scope: "webhook.stripe", type: event.type, id: event.id, err: errorPayload(err) },
      "stripe webhook handler failed",
    );
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  logger.info(
    { scope: "webhook.stripe", type: event.type, id: event.id },
    "stripe webhook processed",
  );
  return NextResponse.json({ received: true });
}

async function dispatchEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.trial_will_end":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const sub = event.data.object as Stripe.Subscription;
      await applyStripeSubscription(sub);
      return;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await clearStripeSubscriptionFromUser(sub);
      return;
    }
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      await handleInvoicePayment(invoice, "succeeded");
      return;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      await handleInvoicePayment(invoice, "failed");
      return;
    }
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      const intent = event.data.object as Stripe.PaymentIntent;
      await handleTipPaymentIntent(intent, event.type);
      return;
    }
    default:
      // Logged once at the boundary so we can spot unexpected event types
      // without flooding the audit log.
      logger.debug(
        { scope: "webhook.stripe", type: event.type, id: event.id },
        "stripe webhook ignored",
      );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  // Tip checkout: independent flow (no Stripe customer linking, no subscription).
  if (session.metadata?.kind === "tip" && typeof session.metadata?.tipId === "string") {
    const tipId = session.metadata.tipId;
    const intentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
    await prisma.tip
      .update({
        where: { id: tipId },
        data: {
          status: "SUCCEEDED",
          settledAt: new Date(),
          ...(intentId ? { stripePaymentIntentId: intentId } : {}),
        },
      })
      .catch((err) => {
        logger.warn(
          { scope: "webhook.stripe", event: "checkout.session.completed.tip", tipId, err: errorPayload(err) },
          "could not flip Tip to SUCCEEDED from checkout.session.completed",
        );
      });
    return;
  }

  // Persist the customer ID against the user (one-shot upgrades land here too).
  const userId =
    typeof session.metadata?.userId === "string" && session.metadata.userId.trim()
      ? session.metadata.userId.trim()
      : null;
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  if (userId && customerId) {
    await prisma.user
      .update({ where: { id: userId }, data: { stripeCustomerId: customerId } })
      .catch((err) => {
        logger.warn(
          { scope: "webhook.stripe", event: "checkout.session.completed", userId, err: errorPayload(err) },
          "could not persist stripeCustomerId on user",
        );
      });
  }

  // If this checkout produced a subscription, fetch + sync it. One-time
  // payment checkouts skip this branch entirely.
  if (session.mode === "subscription" && typeof session.subscription === "string") {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(session.subscription, {
      expand: ["items.data.price"],
    });
    await applyStripeSubscription(sub);
  }
}

async function handleInvoicePayment(
  invoice: Stripe.Invoice,
  outcome: "succeeded" | "failed",
): Promise<void> {
  const subscriptionId =
    typeof (invoice as unknown as { subscription?: string | { id: string } }).subscription ===
      "string"
      ? ((invoice as unknown as { subscription: string }).subscription as string)
      : null;
  if (!subscriptionId) return;

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["items.data.price"],
  });
  // Outcome-specific extras (notification email, dunning) belong here once we
  // ship them — for now, re-sync so `status` reflects what Stripe just decided.
  if (outcome === "failed") {
    const userId = await findUserIdForStripeSubscription(sub);
    if (userId) {
      logger.warn(
        { scope: "webhook.stripe", userId, subscriptionId },
        "stripe invoice payment failed",
      );
    }
  }
  await applyStripeSubscription(sub);

  // Send branded receipt on a successful invoice. Best-effort — failure here
  // must never break the webhook (Stripe would retry and double-flip status).
  if (outcome === "succeeded") {
    void sendInvoiceReceipt(invoice, sub).catch(logBackgroundError("webhook.stripe.invoice.receipt"));
  }
}

/**
 * Render + dispatch the branded subscription receipt. Pulls the user's
 * `preferredLanguage` so the copy localises correctly.
 */
async function sendInvoiceReceipt(invoice: Stripe.Invoice, sub: Stripe.Subscription): Promise<void> {
  const customerEmail = invoice.customer_email ?? null;
  if (!customerEmail) return;

  const userId = await findUserIdForStripeSubscription(sub);
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, preferredLanguage: true },
      }).catch(() => null)
    : null;

  const amount = formatStripeAmount(invoice.amount_paid, invoice.currency);
  const priceItem = sub.items.data[0]?.price;
  const tier = (sub.metadata?.tier ?? priceItem?.nickname ?? "Subscription").toString();
  const interval = priceItem?.recurring?.interval ?? null;
  const itemLabel = interval ? `${tier} (${interval}ly)` : tier;

  await sendBillingReceiptEmail(customerEmail, {
    appOrigin: process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://linksy.app",
    recipientDisplay: user?.displayName ?? "there",
    itemLabel,
    amountFormatted: amount,
    receiptUrl: invoice.hosted_invoice_url ?? undefined,
    paidAt: new Date((invoice.status_transitions?.paid_at ?? Math.floor(Date.now() / 1000)) * 1000).toLocaleString(),
    referenceId: invoice.id ?? sub.id,
    locale: user?.preferredLanguage ?? null,
  });
}

function formatStripeAmount(amount: number, currency: string): string {
  // Stripe gives the smallest currency unit. JPY/KRW/etc are zero-decimal so
  // amount=900 means 900 yen, not 9.00 — Intl handles this when we pass the
  // amount as a Number after dividing by 100 for "standard" currencies. We use
  // `currencyDisplay: "symbol"` so users see "$9.00" not "USD 9.00".
  const isZeroDecimal = ["BIF","CLP","DJF","GNF","JPY","KMF","KRW","MGA","PYG","RWF","UGX","VND","VUV","XAF","XOF","XPF"].includes(currency.toUpperCase());
  const value = isZeroDecimal ? amount : amount / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      currencyDisplay: "symbol",
    }).format(value);
  } catch {
    return `${value.toFixed(isZeroDecimal ? 0 : 2)} ${currency.toUpperCase()}`;
  }
}

/**
 * Tip PaymentIntent lifecycle. Only fires for intents we created via
 * `/api/tips` — Stripe stamps `metadata.kind === "tip"` so we ignore unrelated
 * intents (e.g. Stripe Apps / Connect / off-session subs).
 */
async function handleTipPaymentIntent(
  intent: Stripe.PaymentIntent,
  eventType: string,
): Promise<void> {
  if (intent.metadata?.kind !== "tip") return;
  const tipId = intent.metadata?.tipId;
  if (typeof tipId !== "string" || !tipId) return;

  const nextStatus =
    eventType === "payment_intent.succeeded"
      ? "SUCCEEDED"
      : eventType === "payment_intent.canceled"
        ? "CANCELLED"
        : "FAILED";

  try {
    await prisma.tip.update({
      where: { id: tipId },
      data: { status: nextStatus, settledAt: new Date() },
    });
  } catch (err) {
    logger.warn(
      { scope: "webhook.stripe", event: "tip.intent", tipId, nextStatus, err: errorPayload(err) },
      "could not flip Tip row from stripe webhook",
    );
  }

  // Receipt for the sender on a successful tip. Best-effort.
  if (nextStatus === "SUCCEEDED") {
    void sendTipReceipt(tipId, intent).catch(logBackgroundError("webhook.stripe.tip.receipt"));
  }
}

async function sendTipReceipt(tipId: string, intent: Stripe.PaymentIntent): Promise<void> {
  const tip = await prisma.tip.findUnique({
    where: { id: tipId },
    select: {
      amount: true,
      currency: true,
      fromUser: { select: { email: true, displayName: true, preferredLanguage: true } },
      toUser: { select: { username: true, displayName: true } },
    },
  });
  if (!tip?.fromUser?.email) return;

  const amount = formatStripeAmount(intent.amount_received || tip.amount, tip.currency);
  const itemLabel = `Tip to @${tip.toUser.username}`;

  await sendBillingReceiptEmail(tip.fromUser.email, {
    appOrigin: process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://linksy.app",
    recipientDisplay: tip.fromUser.displayName ?? "there",
    itemLabel,
    amountFormatted: amount,
    receiptUrl:
      typeof intent.latest_charge === "string"
        ? undefined
        : intent.latest_charge?.receipt_url ?? undefined,
    paidAt: new Date(intent.created * 1000).toLocaleString(),
    referenceId: intent.id,
    locale: tip.fromUser.preferredLanguage ?? null,
  });
}

function errorPayload(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}
