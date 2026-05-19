import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type StripeWebhookVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "missing_signature" | "malformed_signature" | "timestamp_skew" | "signature_mismatch" };

/**
 * Verifies `Stripe-Signature` per https://stripe.com/docs/webhooks/signatures
 * @param rawBody — Exact UTF-8 string from the request body (use `await req.text()` before any parse).
 */
export function verifyStripeWebhookSignature(
  rawBody: string,
  stripeSignatureHeader: string | null,
  webhookSecret: string,
  toleranceSeconds = 300,
): StripeWebhookVerifyResult {
  const secret = webhookSecret.trim();
  if (!secret) return { ok: false, reason: "missing_secret" };
  if (!stripeSignatureHeader?.trim()) return { ok: false, reason: "missing_signature" };

  let timestamp: number | null = null;
  const v1Signatures: string[] = [];
  for (const part of stripeSignatureHeader.split(",")) {
    const [key, value] = part.trim().split("=");
    if (!value) continue;
    if (key === "t") timestamp = Number.parseInt(value, 10);
    else if (key === "v1") v1Signatures.push(value.trim());
  }

  if (timestamp == null || !Number.isFinite(timestamp) || v1Signatures.length === 0) {
    return { ok: false, reason: "malformed_signature" };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestamp) > toleranceSeconds) {
    return { ok: false, reason: "timestamp_skew" };
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const key = stripeWebhookSigningKey(secret);
  const expectedHex = createHmac("sha256", key).update(signedPayload, "utf8").digest("hex");

  for (const candidate of v1Signatures) {
    if (hexTimingSafeEqual(candidate.toLowerCase(), expectedHex)) {
      return { ok: true };
    }
  }

  return { ok: false, reason: "signature_mismatch" };
}

/** Dashboard / CLI signing secrets use `whsec_` + base64(key material). */
function stripeWebhookSigningKey(secret: string): Buffer | string {
  const s = secret.trim();
  if (s.startsWith("whsec_")) {
    return Buffer.from(s.slice("whsec_".length), "base64");
  }
  return s;
}

function hexTimingSafeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * Generic HMAC-SHA256(secret, rawBody) compared to `providedHex` (lowercase hex, no prefix).
 * Use for custom push relay / provider callbacks when they send a raw hex or `sha256=` prefixed header.
 */
export function verifyHmacSha256Hex(secret: string, rawBody: string, providedHex: string | null): boolean {
  const s = secret.trim();
  if (!s || !providedHex?.trim()) return false;
  const normalized = providedHex.trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[0-9a-f]{64}$/.test(normalized)) return false;
  const expected = createHmac("sha256", s).update(rawBody, "utf8").digest("hex");
  return hexTimingSafeEqual(normalized, expected);
}

/** Parse `sha256=<hex>` (GitHub / generic) or raw 64-char hex. */
export function normalizeSha256HmacHeader(headerValue: string | null): string | null {
  if (!headerValue?.trim()) return null;
  const t = headerValue.trim();
  const afterPrefix = t.startsWith("sha256=") ? t.slice("sha256=".length).trim() : t;
  return /^[0-9a-fA-F]{64}$/.test(afterPrefix) ? afterPrefix.toLowerCase() : null;
}
