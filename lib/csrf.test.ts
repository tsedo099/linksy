import { describe, expect, it } from "vitest";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  csrfCookieOptions,
  csrfTokensMatch,
  isCsrfExemptPath,
  isMutatingMethod,
  newCsrfTokenValue,
} from "@/lib/csrf";

describe("csrf", () => {
  it("newCsrfTokenValue returns 64-char lowercase hex", () => {
    const a = newCsrfTokenValue();
    const b = newCsrfTokenValue();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("csrfTokensMatch accepts matching cookie and header (case-insensitive)", () => {
    const tok = newCsrfTokenValue();
    expect(csrfTokensMatch(tok, tok)).toBe(true);
    expect(csrfTokensMatch(tok, tok.toUpperCase())).toBe(true);
    expect(csrfTokensMatch(`  ${tok}  `, tok)).toBe(true);
  });

  it("csrfTokensMatch rejects length mismatch and missing values", () => {
    const tok = newCsrfTokenValue();
    expect(csrfTokensMatch(tok.slice(0, 10), tok)).toBe(false);
    expect(csrfTokensMatch(undefined, tok)).toBe(false);
    expect(csrfTokensMatch(tok, null)).toBe(false);
    expect(csrfTokensMatch(tok, "")).toBe(false);
  });

  it("csrfTokensMatch rejects non-hex characters", () => {
    const base = newCsrfTokenValue();
    const corrupted = `${base.slice(0, 4)}gggg${base.slice(8)}`;
    expect(csrfTokensMatch(corrupted, corrupted)).toBe(false);
  });

  it("isMutatingMethod covers common verbs", () => {
    expect(isMutatingMethod("post")).toBe(true);
    expect(isMutatingMethod("PUT")).toBe(true);
    expect(isMutatingMethod("Patch")).toBe(true);
    expect(isMutatingMethod("DELETE")).toBe(true);
    expect(isMutatingMethod("get")).toBe(false);
    expect(isMutatingMethod("HEAD")).toBe(false);
  });

  it("isCsrfExemptPath marks auth and webhook prefixes", () => {
    expect(isCsrfExemptPath("/api/auth/login")).toBe(true);
    expect(isCsrfExemptPath("/api/auth/refresh")).toBe(true);
    expect(isCsrfExemptPath("/api/cron/daily")).toBe(true);
    expect(isCsrfExemptPath("/api/webhooks/stripe")).toBe(true);
    expect(isCsrfExemptPath("/api/posts")).toBe(false);
  });

  it("csrfCookieOptions uses lax sameSite and path", () => {
    const o = csrfCookieOptions();
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
    expect(o.httpOnly).toBe(false);
    expect(typeof o.maxAge).toBe("number");
  });

  it("exposes stable cookie/header names for middleware", () => {
    expect(CSRF_COOKIE_NAME).toBe("linksy_csrf");
    expect(CSRF_HEADER_NAME).toBe("x-csrf-token");
  });
});
