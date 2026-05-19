import { NextRequest, NextResponse } from "next/server";

/** Comma-separated exact origins, e.g. https://app.example.com,https://localhost:3001 */
export function corsAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * If request Origin matches the allowlist, returns that origin for ACAO.
 * No env → no cross-origin (returns null for every Origin).
 */
export function matchedCorsOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = corsAllowedOrigins();
  if (allowed.length === 0) return null;
  return allowed.includes(origin) ? origin : null;
}

const CORS_METHODS = "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS";
const DEFAULT_ALLOW_HEADERS =
  "Content-Type, Authorization, X-Requested-With, x-csrf-token, X-CSRF-Token";

/** Attach CORS headers to an outgoing API response when Origin is allowed. */
export function withApiCorsHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const allow = matchedCorsOrigin(request);
  if (!allow) return response;

  response.headers.set("Access-Control-Allow-Origin", allow);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.append("Vary", "Origin");

  return response;
}

/**
 * Preflight for /api/*. Always 204 so browsers do not follow a 302 to /login.
 * ACAO set only when Origin matches CORS_ALLOWED_ORIGINS.
 */
export function apiCorsPreflightResponse(request: NextRequest): NextResponse {
  const allow = matchedCorsOrigin(request);
  const res = new NextResponse(null, { status: 204 });

  if (allow) {
    res.headers.set("Access-Control-Allow-Origin", allow);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Methods", CORS_METHODS);
    const reqHeaders = request.headers.get("access-control-request-headers");
    res.headers.set(
      "Access-Control-Allow-Headers",
      reqHeaders && reqHeaders.length > 0 ? reqHeaders : DEFAULT_ALLOW_HEADERS,
    );
    res.headers.set("Access-Control-Max-Age", "86400");
  }

  res.headers.append("Vary", "Origin");
  return res;
}
