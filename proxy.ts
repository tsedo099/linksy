import { NextRequest, NextResponse } from "next/server";

import { buildAppContentSecurityPolicy } from "@/lib/content-security-policy";
import { apiCorsPreflightResponse, withApiCorsHeaders } from "@/lib/cors";
import { csrfRequiredFailed } from "@/lib/csrf";

/** Unauthenticated flows: login, signup, password reset, email verification, 2FA verify. */
const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/auth/forgot-password",
  "/auth/reset",
  "/auth/verify-email",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/request-reset",
  "/api/auth/reset",
  "/api/auth/send-verification",
  "/api/auth/verify-email",
  "/api/auth/2fa/verify",
  "/api/auth/passkeys/authenticate/options",
  "/api/auth/passkeys/authenticate/verify",
  "/api/auth/google",
  "/api/oauth/token",
];

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isDocumentRequest(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api")) return false;
  if (pathname.startsWith("/_next")) return false;
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("text/html") || accept.includes("*/*");
}

function isVercelPreview() {
  return process.env.VERCEL_ENV === "preview" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
}

function withSecurityHeaders(req: NextRequest, res: NextResponse, nonce?: string): NextResponse {
  if (!isDocumentRequest(req)) return res;
  const reportOnly = process.env.CSP_REPORT_ONLY === "1" || process.env.CSP_REPORT_ONLY === "true";
  const csp = buildAppContentSecurityPolicy({
    nonce,
    reportOnly,
    includeVercelLive: isVercelPreview(),
  });
  res.headers.set(reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy", csp);
  res.headers.set(
    "Report-To",
    JSON.stringify({
      group: "csp-endpoint",
      max_age: 10886400,
      endpoints: [{ url: "/api/csp-report" }],
    }),
  );
  res.headers.set("Reporting-Endpoints", 'csp-endpoint="/api/csp-report"');
  if (nonce) res.headers.set("x-nonce", nonce);
  return res;
}

function nextWithApiCors(req: NextRequest): NextResponse {
  const nonce = isDocumentRequest(req) ? createNonce() : undefined;
  const requestHeaders = new Headers(req.headers);
  if (nonce) {
    const requestCsp = buildAppContentSecurityPolicy({
      nonce,
      reportOnly: false,
      includeVercelLive: isVercelPreview(),
    });
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", requestCsp);
  }

  const res = withSecurityHeaders(
    req,
    NextResponse.next({ request: { headers: requestHeaders } }),
    nonce,
  );
  if (req.nextUrl.pathname.startsWith("/api")) {
    return withApiCorsHeaders(res, req);
  }
  return res;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (req.method === "OPTIONS" && pathname.startsWith("/api")) {
    return apiCorsPreflightResponse(req);
  }

  if (csrfRequiredFailed(req)) {
    const res = NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    return withApiCorsHeaders(res, req);
  }

  const isPublic =
    pathname === "/" ||
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/api/csp-report") ||
    pathname.startsWith("/api/v1") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    // Static user uploads served from `public/uploads/`. Next/Image internally
    // re-fetches the same-origin URL when optimizing; the middleware redirect
    // turned that into an HTML login page → "received null" in the optimizer.
    pathname.startsWith("/uploads/");

  if (isPublic) return nextWithApiCors(req);

  const token = req.cookies.get("linksy_token")?.value;
  const refresh = req.cookies.get("linksy_refresh")?.value;

  if (!token && !refresh) {
    if (pathname.startsWith("/api")) {
      const res = NextResponse.json({ error: "Not authenticated." }, { status: 401 });
      return withApiCorsHeaders(res, req);
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return nextWithApiCors(req);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
