import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeSha256HmacHeader,
  verifyHmacSha256Hex,
  verifyStripeWebhookSignature,
} from "@/lib/webhook-signatures";

describe("webhook-signatures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("verifyStripeWebhookSignature rejects empty secret", () => {
    expect(verifyStripeWebhookSignature("{}", "t=1,v1=ab", "  ")).toEqual({
      ok: false,
      reason: "missing_secret",
    });
  });

  it("verifyStripeWebhookSignature rejects missing header", () => {
    expect(verifyStripeWebhookSignature("{}", null, "whsec_test")).toEqual({
      ok: false,
      reason: "missing_signature",
    });
  });

  it("verifyStripeWebhookSignature rejects malformed header", () => {
    expect(verifyStripeWebhookSignature("{}", "v1=only", "whsec_test")).toEqual({
      ok: false,
      reason: "malformed_signature",
    });
  });

  it("verifyStripeWebhookSignature rejects timestamp skew", () => {
    const rawBody = "{}";
    const key = randomBytes(32);
    const secret = `whsec_${key.toString("base64")}`;
    const oldTs = Math.floor(Date.now() / 1000) - 10_000;
    const signedPayload = `${oldTs}.${rawBody}`;
    const expected = createHmac("sha256", key).update(signedPayload, "utf8").digest("hex");
    const header = `t=${oldTs},v1=${expected}`;
    expect(verifyStripeWebhookSignature(rawBody, header, secret, 300)).toEqual({
      ok: false,
      reason: "timestamp_skew",
    });
  });

  it("verifyStripeWebhookSignature accepts valid v1 signature", () => {
    const rawBody = '{"id":"evt_1"}';
    const key = randomBytes(32);
    const secret = `whsec_${key.toString("base64")}`;
    const ts = Math.floor(Date.now() / 1000);
    const signedPayload = `${ts}.${rawBody}`;
    const expected = createHmac("sha256", key).update(signedPayload, "utf8").digest("hex");
    const header = `t=${ts},v1=${expected}`;
    expect(verifyStripeWebhookSignature(rawBody, header, secret)).toEqual({ ok: true });
  });

  it("verifyStripeWebhookSignature tries multiple v1 entries", () => {
    const rawBody = "{}";
    const key = randomBytes(32);
    const secret = `whsec_${key.toString("base64")}`;
    const ts = Math.floor(Date.now() / 1000);
    const signedPayload = `${ts}.${rawBody}`;
    const expected = createHmac("sha256", key).update(signedPayload, "utf8").digest("hex");
    const header = `t=${ts},v1=deadbeef,v1=${expected}`;
    expect(verifyStripeWebhookSignature(rawBody, header, secret)).toEqual({ ok: true });
  });

  it("verifyHmacSha256Hex validates payload", () => {
    const secret = "hmac-secret";
    const body = '{"x":1}';
    const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyHmacSha256Hex(secret, body, hex)).toBe(true);
    expect(verifyHmacSha256Hex(secret, body, `sha256=${hex}`)).toBe(true);
    expect(verifyHmacSha256Hex(secret, body, "00".repeat(31))).toBe(false);
    expect(verifyHmacSha256Hex("", body, hex)).toBe(false);
    expect(verifyHmacSha256Hex(secret, body, null)).toBe(false);
  });

  it("normalizeSha256HmacHeader trims and strips prefix", () => {
    const h = "a".repeat(64);
    expect(normalizeSha256HmacHeader(`  sha256=${h}  `)).toBe(h);
    expect(normalizeSha256HmacHeader("short")).toBeNull();
    expect(normalizeSha256HmacHeader(null)).toBeNull();
  });
});
