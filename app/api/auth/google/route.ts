import { NextRequest, NextResponse } from "next/server";

import {
  buildGoogleAuthorizeUrl,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_MAX_AGE_SEC,
  googleOAuthConfigured,
  newOAuthState,
} from "@/lib/google-oauth";

const isProd = process.env.NODE_ENV === "production";

/**
 * Starts Google OAuth: sets CSRF state cookie and redirects to Google.
 */
export async function GET(req: NextRequest) {
  if (!googleOAuthConfigured()) {
    return NextResponse.json(
      { error: "Google sign-in is not configured on this server." },
      { status: 503 },
    );
  }

  const state = newOAuthState();
  const url = buildGoogleAuthorizeUrl(state);

  const res = NextResponse.redirect(url);
  res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: GOOGLE_OAUTH_STATE_MAX_AGE_SEC,
  });
  return res;
}
