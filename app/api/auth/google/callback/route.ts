import { NextRequest, NextResponse } from "next/server";

import { applyAuthCookies } from "@/lib/auth-cookies";
import { writeAuditLog } from "@/lib/audit-log";
import { clientIpFromRequest } from "@/lib/client-ip";
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_STATE_MAX_AGE_SEC,
  googleOAuthConfigured,
} from "@/lib/google-oauth";
import { allocateUsernameFromEmail } from "@/lib/google-oauth-username";
import { logBackgroundError } from "@/lib/logger";
import { notifyContactOwnersOnJoin } from "@/lib/notify-friend-join";
import { prisma } from "@/lib/prisma";
import { createSessionAndIssueTokens } from "@/lib/refresh-session";
import { grantXP } from "@/lib/services/xp.service";
import { notifyOnNewDeviceLogin, sendWelcomeEmail } from "@/lib/email-templates";
import { parseAppLanguage } from "@/lib/language";

function appOrigin(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
}

function redirectWithError(req: NextRequest, message: string): NextResponse {
  const login = new URL("/login", appOrigin(req));
  login.searchParams.set("error", message);
  const res = NextResponse.redirect(login);
  res.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  if (!googleOAuthConfigured()) {
    return redirectWithError(req, "google_not_configured");
  }

  const url = req.nextUrl;
  const code = url.searchParams.get("code")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const cookieState = req.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !cookieState || state !== cookieState) {
    return redirectWithError(req, "oauth_state");
  }

  let profile: Awaited<ReturnType<typeof fetchGoogleUserInfo>>;
  try {
    const { accessToken } = await exchangeGoogleCode(code);
    profile = await fetchGoogleUserInfo(accessToken);
  } catch {
    return redirectWithError(req, "oauth_google");
  }

  const email = profile.email?.trim().toLowerCase();
  if (!email || !profile.email_verified) {
    return redirectWithError(req, "oauth_email");
  }

  const googleId = profile.sub;
  const displayName =
    profile.name?.trim() ||
    email
      .split("@")[0]
      ?.replace(/[._-]+/g, " ")
      .trim() ||
    "User";
  const avatarUrl = profile.picture?.trim() || null;

  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId }, { email }] },
  });

  if (user) {
    if (user.accountDeletionRequestedAt) {
      return redirectWithError(req, "account_closed");
    }
    if (user.googleId && user.googleId !== googleId) {
      return redirectWithError(req, "oauth_mismatch");
    }
    if (!user.googleId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId, emailVerified: true },
      });
    } else if (!user.emailVerified && profile.email_verified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    }
  } else {
    const username = await allocateUsernameFromEmail(email);
    user = await prisma.user.create({
      data: {
        username,
        email,
        googleId,
        passwordHash: null,
        displayName: displayName.slice(0, 80),
        avatarUrl,
        emailVerified: Boolean(profile.email_verified),
        preferredLanguage: parseAppLanguage(undefined),
        quietHoursStart: 22 * 60,
        quietHoursEnd: 7 * 60,
        quietHoursTimezone: "UTC",
      },
    });

    notifyContactOwnersOnJoin(user.id, email).catch(logBackgroundError("auth.google.contactNotify"));

    const origin = appOrigin(req);
    sendWelcomeEmail(user.email, {
      appOrigin: origin,
      recipientDisplay: user.displayName,
      locale: user.preferredLanguage,
    }).catch(logBackgroundError("auth.google.welcomeEmail"));
  }

  if (user.twoFactorEnabled) {
    const login = new URL("/login", appOrigin(req));
    login.searchParams.set("error", "google_2fa");
    const res = NextResponse.redirect(login);
    res.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return res;
  }

  const userAgent = req.headers.get("user-agent") ?? null;
  const clientIp = clientIpFromRequest(req);
  const ipAddress = clientIp !== "unknown" ? clientIp : null;

  const { sessionId, accessJwt, refreshRaw } = await createSessionAndIssueTokens({
    userId: user.id,
    username: user.username,
    email: user.email,
    userAgent,
    ipAddress,
  });

  const home = new URL("/home", appOrigin(req));
  const res = NextResponse.redirect(home);
  res.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  applyAuthCookies(res, accessJwt, refreshRaw);

  grantXP({ userId: user.id, action: "DAILY_LOGIN" }).catch(logBackgroundError("xp.grant.DAILY_LOGIN"));
  await writeAuditLog({
    action: "LOGIN_SUCCESS",
    actorUserId: user.id,
    targetType: "SESSION",
    targetId: sessionId,
    metadata: { via: "google_oauth" },
    request: req,
  });

  notifyOnNewDeviceLogin({
    userId: user.id,
    email: user.email,
    recipientDisplay: user.displayName,
    appOrigin: appOrigin(req),
    newSessionId: sessionId,
    userAgent,
    ipAddress,
  }).catch(logBackgroundError("auth.google.newDeviceAlert"));

  return res;
}
