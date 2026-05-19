"use client";

import { useLayoutEffect } from "react";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@/lib/csrf";
import { useCurrentUserStore } from "@/lib/stores/current-user";

function readCsrfFromDocumentCookie(): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === CSRF_COOKIE_NAME) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

function isSameOriginApiUrl(url: string): boolean {
  if (url.startsWith("/api/")) return true;
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function apiPathname(url: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return null;
  }
}

function isPublicPagePath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/auth/forgot-password") ||
    pathname.startsWith("/auth/reset") ||
    pathname.startsWith("/auth/verify-email")
  );
}

function shouldRedirectAfterUnauthorized(url: string): boolean {
  const pathname = apiPathname(url);
  if (!pathname) return false;

  if (pathname === "/api/auth/login" || pathname === "/api/auth/register") return false;
  if (pathname.startsWith("/api/auth/passkeys/authenticate")) return false;
  if (window.location.pathname === "/login" || isPublicPagePath(window.location.pathname)) return false;

  return isSameOriginApiUrl(url);
}

function redirectToLoginAfterUnauthorized(): void {
  const target = new URL("/login", window.location.origin);
  const current = `${window.location.pathname}${window.location.search}`;
  if (!isPublicPagePath(window.location.pathname)) {
    target.searchParams.set("next", current);
  }
  window.location.assign(target.toString());
}

/**
 * Patches `window.fetch` so mutating requests to /api/* include the CSRF double-submit header.
 * Safe-mode: if the CSRF cookie is missing, the header is omitted (request may 403 until /api/auth/me runs).
 */
export function CsrfFetchBridge() {
  useLayoutEffect(() => {
    const w = window as Window & { __LINKSY_CSRF_FETCH__?: typeof fetch };
    if (w.__LINKSY_CSRF_FETCH__) return;

    const original = window.fetch.bind(window);

    w.__LINKSY_CSRF_FETCH__ = original;

    window.fetch = function csrfAwareFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      let urlStr: string;
      if (typeof input === "string") {
        urlStr = input;
      } else if (input instanceof URL) {
        urlStr = input.toString();
      } else {
        return original(input, init);
      }

      const method = (init?.method ?? "GET").toUpperCase();
      let request: Promise<Response>;

      if (
        isSameOriginApiUrl(urlStr)
        && (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE")
      ) {
        const token = readCsrfFromDocumentCookie();
        if (token) {
          const headers = new Headers(init?.headers as HeadersInit | undefined);
          if (!headers.has(CSRF_HEADER_NAME)) {
            headers.set(CSRF_HEADER_NAME, token);
          }
          request = original(urlStr, { ...init, headers });
        } else {
          request = original(input, init);
        }
      } else {
        request = original(input, init);
      }

      return request.then((response) => {
        if (response.status === 401 && shouldRedirectAfterUnauthorized(urlStr)) {
          useCurrentUserStore.getState().setUser(null);
          redirectToLoginAfterUnauthorized();
        }
        return response;
      });
    };

    return () => {
      window.fetch = original;
      delete w.__LINKSY_CSRF_FETCH__;
    };
  }, []);

  return null;
}
