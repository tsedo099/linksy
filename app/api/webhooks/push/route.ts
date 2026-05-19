import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { normalizeSha256HmacHeader, verifyHmacSha256Hex } from "@/lib/webhook-signatures";

export const runtime = "nodejs";

/**
 * Generic HMAC-signed inbound webhook for push/delivery providers (FCM relay, custom gateway, etc.).
 * Client must send header `X-Linksy-Push-Signature: sha256=<64 hex>` (or raw 64-char hex)
 * where digest = HMAC-SHA256(`PUSH_WEBHOOK_HMAC_SECRET`, raw body UTF-8).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_WEBHOOK_HMAC_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Push webhooks are not configured.", code: "NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const rawBody = await req.text();
  const headerVal =
    req.headers.get("x-linksy-push-signature")
    ?? req.headers.get("x-webhook-signature")
    ?? req.headers.get("x-hub-signature-256");
  const hex = normalizeSha256HmacHeader(headerVal);

  if (!verifyHmacSha256Hex(secret, rawBody, hex)) {
    return NextResponse.json({ error: "Invalid push webhook signature." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = rawBody.length > 0 ? (JSON.parse(rawBody) as unknown) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  logger.info({ scope: "webhook.push" }, "push webhook accepted");

  // TODO: map payload to internal actions (delivery receipts, invalidation, …)
  void payload;
  return NextResponse.json({ received: true });
}
