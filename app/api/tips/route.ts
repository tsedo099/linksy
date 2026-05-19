import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { tipCreateBodySchema } from "@/lib/schemas/api-bodies";
import { getStripe, stripeSecretKey } from "@/lib/stripe";
import { areUsersBlocked } from "@/lib/user-blocks";
import { sanitizePlainText } from "@/lib/sanitize-html";
import { consumeRateLimit } from "@/lib/rate-limit";
import { userNotPendingHardDelete } from "@/lib/user-not-pending-deletion";

export const runtime = "nodejs";

/** Per-user create-tip throttle — five tips/minute is plenty even for power users. */
const TIP_CREATE_LIMIT = { windowMs: 60_000, max: 5 } as const;

/**
 * POST /api/tips — open a Stripe Checkout session for tipping another user.
 *
 *   Body  { toUserId, amount, currency?, message? }
 *   Reply { tipId, url }
 *
 * Client navigates to `url` (Stripe-hosted payment page). The
 * [stripe webhook](app/api/webhooks/stripe/route.ts) flips the Tip row to
 * SUCCEEDED on `checkout.session.completed` and FAILED / CANCELLED on the
 * matching PaymentIntent events. Stripe Checkout is used (rather than the
 * `confirmPayment` Elements flow) so the project doesn't need to ship
 * `@stripe/stripe-js` to the client — fewer kilobytes, fewer surfaces.
 */
export async function POST(req: NextRequest) {
  if (!stripeSecretKey()) {
    return NextResponse.json(
      { error: "Stripe is not configured on the server.", code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const rate = await consumeRateLimit("tips:create", me.userId, TIP_CREATE_LIMIT);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many tips in a short window — slow down." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const parsed = await parseRequestJson(req, tipCreateBodySchema);
  if (!parsed.ok) return parsed.response;
  const { toUserId, amount, currency, message } = parsed.data;

  if (toUserId === me.userId) {
    return NextResponse.json({ error: "You cannot tip yourself." }, { status: 400 });
  }

  if (await areUsersBlocked(me.userId, toUserId)) {
    return NextResponse.json({ error: "User unavailable." }, { status: 403 });
  }

  const recipient = await prisma.user.findFirst({
    where: { id: toUserId, ...userNotPendingHardDelete },
    select: { id: true, username: true, displayName: true },
  });
  if (!recipient) {
    return NextResponse.json({ error: "Recipient not found." }, { status: 404 });
  }

  const safeMessage = message ? sanitizePlainText(message).trim().slice(0, 200) : null;

  // Create the Tip row first so we have an ID to stamp into Stripe metadata.
  const tip = await prisma.tip.create({
    data: {
      fromId: me.userId,
      toId: recipient.id,
      amount,
      currency,
      message: safeMessage || null,
      status: "PENDING",
    },
  });

  const origin = resolveOrigin(req);
  const successUrl = `${origin}/settings/tips?status=success&tipId=${encodeURIComponent(tip.id)}`;
  const cancelUrl = `${origin}/settings/tips?status=cancelled&tipId=${encodeURIComponent(tip.id)}`;

  const stripe = getStripe();
  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_intent_data: {
          description: `Linksy tip → @${recipient.username}`,
          metadata: {
            kind: "tip",
            tipId: tip.id,
            fromUserId: me.userId,
            toUserId: recipient.id,
          },
        },
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: `Tip for @${recipient.username}`,
                description: safeMessage ? `"${safeMessage.slice(0, 120)}"` : undefined,
              },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        client_reference_id: tip.id,
        metadata: { kind: "tip", tipId: tip.id, fromUserId: me.userId, toUserId: recipient.id },
        success_url: successUrl,
        cancel_url: cancelUrl,
      },
      // Retries return the same session (network blips / double-clicks).
      { idempotencyKey: `tip:${tip.id}` },
    );

    if (!session.url) {
      throw new Error("Stripe returned a session without a URL.");
    }

    await prisma.tip.update({
      where: { id: tip.id },
      data: {
        stripePaymentIntentId:
          typeof session.payment_intent === "string" ? session.payment_intent : null,
      },
    });

    return NextResponse.json({ tipId: tip.id, url: session.url });
  } catch (err) {
    logger.error(
      { scope: "tips.create", userId: me.userId, toUserId: recipient.id, err: err instanceof Error ? err.message : String(err) },
      "stripe checkout session create failed",
    );
    await prisma.tip
      .update({ where: { id: tip.id }, data: { status: "FAILED", settledAt: new Date() } })
      .catch(() => undefined);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 502 },
    );
  }
}

/** GET /api/tips?box=incoming|outgoing — list the caller's tips. */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const box = req.nextUrl.searchParams.get("box") === "outgoing" ? "outgoing" : "incoming";
  const where = box === "outgoing" ? { fromId: me.userId } : { toId: me.userId };

  const tips = await prisma.tip.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      fromUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      toUser: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({
    tips: tips.map((t) => ({
      id: t.id,
      amount: t.amount,
      currency: t.currency,
      message: t.message,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      settledAt: t.settledAt?.toISOString() ?? null,
      from: t.fromUser,
      to: t.toUser,
    })),
  });
}

function resolveOrigin(req: NextRequest): string {
  const configured = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return req.nextUrl.origin;
}
