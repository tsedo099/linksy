import type { NextResponse } from "next/server";

import { CSRF_COOKIE_NAME, csrfCookieOptions, newCsrfTokenValue } from "@/lib/csrf";

export const LINKSY_ACCESS_COOKIE = "linksy_token";
export const LINKSY_REFRESH_COOKIE = "linksy_refresh";

/** Access JWT lifetime (must match jwt.ts). */
export const ACCESS_MAX_AGE_SEC = 15 * 60;

/** Refresh token cookie + session sliding window (30 days). */
export const REFRESH_MAX_AGE_SEC = 60 * 60 * 24 * 30;

const isProd = process.env.NODE_ENV === "production";

function baseCookieOpts() {
  return {
    httpOnly: true as const,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
  };
}

export function accessCookieOptions() {
  return { ...baseCookieOpts(), maxAge: ACCESS_MAX_AGE_SEC };
}

export function refreshCookieOptions() {
  return { ...baseCookieOpts(), maxAge: REFRESH_MAX_AGE_SEC };
}

export function applyAuthCookies(
  res: NextResponse,
  accessJwt: string,
  refreshRaw: string,
): void {
  res.cookies.set(LINKSY_ACCESS_COOKIE, accessJwt, accessCookieOptions());
  res.cookies.set(LINKSY_REFRESH_COOKIE, refreshRaw, refreshCookieOptions());
  res.cookies.set(CSRF_COOKIE_NAME, newCsrfTokenValue(), csrfCookieOptions());
}

export function clearAuthCookies(res: NextResponse): void {
  res.cookies.delete(LINKSY_ACCESS_COOKIE);
  res.cookies.delete(LINKSY_REFRESH_COOKIE);
  res.cookies.delete(CSRF_COOKIE_NAME);
}

type MutableRouteCookies = {
  set: (name: string, value: string, options: object) => void;
  delete: (name: string) => void;
};

/** next/headers cookies() in Route Handlers. */
export function applyAuthCookiesToStore(
  store: MutableRouteCookies,
  accessJwt: string,
  refreshRaw: string,
): void {
  store.set(LINKSY_ACCESS_COOKIE, accessJwt, accessCookieOptions());
  store.set(LINKSY_REFRESH_COOKIE, refreshRaw, refreshCookieOptions());
}

export function clearAuthCookiesOnStore(store: MutableRouteCookies): void {
  store.delete(LINKSY_ACCESS_COOKIE);
  store.delete(LINKSY_REFRESH_COOKIE);
  store.delete(CSRF_COOKIE_NAME);
}
