import type { NextRequest } from "next/server";

/** Double-submit token: readable by JS (not httpOnly), same lifetime as refresh session. */
export const CSRF_COOKIE_NAME = "linksy_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

const CSRF_BYTES = 32;
const CSRF_HEX_LEN = CSRF_BYTES * 2;

const isProd = process.env.NODE_ENV === "production";

export function csrfCookieOptions() {
  return {
    httpOnly: false as const,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge: 60 * 60 * 24 * 30,
  };
}

export function newCsrfTokenValue(): string {
  const buf = new Uint8Array(CSRF_BYTES);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== CSRF_HEX_LEN || b.length !== CSRF_HEX_LEN) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < CSRF_HEX_LEN; i++) {
    const ca = a.charCodeAt(i);
    const cb = b.charCodeAt(i);
    const da = ca >= 48 && ca <= 57 ? ca - 48 : ca >= 97 && ca <= 102 ? ca - 97 + 10 : -1;
    const db = cb >= 48 && cb <= 57 ? cb - 48 : cb >= 97 && cb <= 102 ? cb - 97 + 10 : -1;
    if (da < 0 || db < 0) return false;
    diff |= da ^ db;
  }
  return diff === 0;
}

export function csrfTokensMatch(cookieVal: string | undefined, headerVal: string | null): boolean {
  if (!cookieVal || headerVal == null || headerVal === "") return false;
  return timingSafeEqualHex(cookieVal.trim().toLowerCase(), headerVal.trim().toLowerCase());
}

export function isMutatingMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

const CSRF_EXEMPT_EXACT = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/request-reset",
  "/api/auth/send-verification",
  "/api/auth/reset",
  "/api/auth/verify-email",
  "/api/auth/2fa/verify",
  "/api/auth/refresh",
  "/api/auth/passkeys/authenticate/options",
  "/api/auth/passkeys/authenticate/verify",
  "/api/oauth/token",
  "/api/metrics/web-vitals",
  "/api/csp-report",
]);

/** Paths that must accept cookie auth without prior CSRF (login, tokens, cron, RUM beacons). */
export function isCsrfExemptPath(pathname: string): boolean {
  if (pathname.startsWith("/api/cron")) return true;
  if (pathname.startsWith("/api/webhooks")) return true;
  return CSRF_EXEMPT_EXACT.has(pathname);
}

function hasAuthSessionCookie(req: NextRequest): boolean {
  return Boolean(
    req.cookies.get("linksy_token")?.value || req.cookies.get("linksy_refresh")?.value,
  );
}

export function csrfRequiredFailed(req: NextRequest): boolean {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/api")) return false;
  if (!isMutatingMethod(req.method)) return false;
  if (isCsrfExemptPath(pathname)) return false;
  if (!hasAuthSessionCookie(req)) return false;

  const cookieVal = req.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerVal = req.headers.get(CSRF_HEADER_NAME);
  return !csrfTokensMatch(cookieVal, headerVal);
}
