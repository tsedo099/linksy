import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginsTotal } from "@/lib/metrics";
import { trackActiveUser } from "@/lib/active-users";
import { recordLoginAttempt } from "@/lib/login-attempts";
import { withMetrics } from "@/lib/with-metrics";
import { signTwoFactorChallenge } from "@/lib/jwt";
import { applyAuthCookies } from "@/lib/auth-cookies";
import { createSessionAndIssueTokens } from "@/lib/refresh-session";
import { grantXP } from "@/lib/services/xp.service";
import { writeAuditLog } from "@/lib/audit-log";
import { logBackgroundError, logger } from "@/lib/logger";
import { parseRequestJson } from "@/lib/request-json";
import { loginBodySchema } from "@/lib/schemas/api-bodies";
import { notifyOnNewDeviceLogin } from "@/lib/email-templates";
import {
  consumeRateLimit,
  AUTH_LOGIN_IDENTIFIER_LIMIT,
  AUTH_LOGIN_IP_LIMIT,
} from "@/lib/rate-limit";
import { clientIpFromRequest } from "@/lib/client-ip";
import { assessPasswordHealth } from "@/lib/password-policy";

const LOGIN_FAILURES_BEFORE_LOCK = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many login attempts. Please try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

function accountLockedResponse(lockedUntil: Date) {
  const retryAfter = Math.max(
    1,
    Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
  );
  return NextResponse.json(
    { error: "Too many failed login attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

function loginRateIdentifierKey(rawLoginField: string, isEmail: boolean): string {
  const t = rawLoginField.trim().slice(0, 240);
  return isEmail ? t.toLowerCase() : t;
}

export const POST = withMetrics("/api/auth/login", async (req: NextRequest) => {
  try {
    const parsed = await parseRequestJson(req, loginBodySchema);
    if (!parsed.ok) return parsed.response;
    const { email: rawLogin, password } = parsed.data;
    const loginId = rawLogin.trim();

    const clientIp = clientIpFromRequest(req);
    const ipLimit = await consumeRateLimit("auth:login:ip", clientIp, AUTH_LOGIN_IP_LIMIT);
    if (!ipLimit.ok) {
      void recordLoginAttempt({ req, email: loginId, succeeded: false, failureReason: "rate_limited" });
      return rateLimitResponse(ipLimit.retryAfterSeconds);
    }

    const isEmail = rawLogin.includes("@");
    const identifierKey = loginRateIdentifierKey(rawLogin, isEmail);
    const idLimit = await consumeRateLimit(
      "auth:login:id",
      identifierKey,
      AUTH_LOGIN_IDENTIFIER_LIMIT,
    );
    if (!idLimit.ok) {
      void recordLoginAttempt({ req, email: loginId, succeeded: false, failureReason: "rate_limited" });
      return rateLimitResponse(idLimit.retryAfterSeconds);
    }

    const user = isEmail
      ? await prisma.user.findUnique({ where: { email: rawLogin.trim() } })
      : await prisma.user.findUnique({ where: { username: rawLogin.trim() } });

    if (!user) {
      await writeAuditLog({
        action: "LOGIN_FAILED",
        targetType: "USER_IDENTIFIER",
        targetId: loginId || null,
        metadata: { reason: "USER_NOT_FOUND" },
        request: req,
      });
      void recordLoginAttempt({ req, email: loginId, succeeded: false, failureReason: "no_user" });
      return NextResponse.json(
        { error: "Incorrect email or password." },
        { status: 401 },
      );
    }

    if (!user.passwordHash) {
      await writeAuditLog({
        action: "LOGIN_FAILED",
        actorUserId: user.id,
        targetType: "USER",
        targetId: user.id,
        metadata: { reason: "OAUTH_ONLY_ACCOUNT" },
        request: req,
      });
      void recordLoginAttempt({ req, email: loginId, succeeded: false, failureReason: "oauth_only", userId: user.id });
      return NextResponse.json(
        { error: "This account uses Google sign-in. Use “Continue with Google” below." },
        { status: 401 },
      );
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await writeAuditLog({
        action: "LOGIN_FAILED",
        actorUserId: user.id,
        targetType: "USER",
        targetId: user.id,
        metadata: { reason: "ACCOUNT_LOCKED" },
        request: req,
      });
      void recordLoginAttempt({ req, email: loginId, succeeded: false, failureReason: "locked", userId: user.id });
      return accountLockedResponse(user.lockedUntil);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: { increment: 1 } },
        });
        const row = await tx.user.findUnique({
          where: { id: user.id },
          select: { failedLoginAttempts: true },
        });
        const n = row?.failedLoginAttempts ?? 0;
        if (n >= LOGIN_FAILURES_BEFORE_LOCK) {
          await tx.user.update({
            where: { id: user.id },
            data: {
              lockedUntil: new Date(Date.now() + LOGIN_LOCKOUT_MS),
            },
          });
        }
      });

      await writeAuditLog({
        action: "LOGIN_FAILED",
        actorUserId: user.id,
        targetType: "USER",
        targetId: user.id,
        metadata: { reason: "INVALID_PASSWORD" },
        request: req,
      });
      void recordLoginAttempt({ req, email: loginId, succeeded: false, failureReason: "bad_password", userId: user.id });
      return NextResponse.json(
        { error: "Incorrect email or password." },
        { status: 401 },
      );
    }

    await prisma.user
      .update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      })
      .catch(logBackgroundError("auth.login.resetLoginFailures"));

    const userWithDeletion = user as typeof user & { accountDeletionRequestedAt?: Date | null };
    if (userWithDeletion.accountDeletionRequestedAt) {
      await writeAuditLog({
        action: "LOGIN_FAILED",
        actorUserId: user.id,
        targetType: "USER",
        targetId: user.id,
        metadata: { reason: "ACCOUNT_PENDING_DELETION" },
        request: req,
      });
      void recordLoginAttempt({ req, email: loginId, succeeded: false, failureReason: "deleted", userId: user.id });
      return NextResponse.json(
        { error: "This account is closed and scheduled for deletion." },
        { status: 403 },
      );
    }

    const userWithDeactivation = user as typeof user & { deactivatedAt?: Date | null };
    if (userWithDeactivation.deactivatedAt) {
      await prisma.user
        .update({ where: { id: user.id }, data: { deactivatedAt: null } })
        .catch(logBackgroundError("auth.login.clearDeactivatedAt"));
      await writeAuditLog({
        action: "ACCOUNT_REACTIVATED",
        actorUserId: user.id,
        targetType: "USER",
        targetId: user.id,
        request: req,
      }).catch(logBackgroundError("auth.login.auditReactivate"));
    }

    if (user.twoFactorEnabled) {
      const challengeToken = signTwoFactorChallenge(user.id);
      await writeAuditLog({
        action: "LOGIN_2FA_CHALLENGE",
        actorUserId: user.id,
        targetType: "USER",
        targetId: user.id,
        request: req,
      });
      // Password was correct, but a 2FA challenge is now pending; mark this
      // as "2fa_required" rather than success — the 2FA verify endpoint will
      // log the eventual success or failure.
      void recordLoginAttempt({ req, email: loginId, succeeded: false, failureReason: "2fa_required", userId: user.id });

      // We've already verified the password; surface its health to the client
      // now so the rotate-banner shows once 2FA completes, regardless of which
      // sign-in path the user took.
      const twoFaPasswordHealth = await assessPasswordHealth(password).catch(() => null);
      return NextResponse.json({
        requires2FA: true,
        challengeToken,
        ...(twoFaPasswordHealth && twoFaPasswordHealth.severity !== "ok"
          ? { passwordHealth: twoFaPasswordHealth }
          : {}),
      });
    }

    const userAgent = req.headers.get("user-agent") ?? null;
    const ipAddress =
      clientIp !== "unknown" ? clientIp : null;

    const { sessionId, accessJwt, refreshRaw } = await createSessionAndIssueTokens({
      userId: user.id,
      username: user.username,
      email: user.email,
      userAgent,
      ipAddress,
    });

    // Best-effort health check on the just-verified plaintext password. We
    // already know the user knows this password (bcrypt.compare succeeded) so
    // leaking the first 5 SHA-1 chars to HIBP is fine. The result is
    // surfaced on the response so the client can render a non-blocking
    // "your password is weak — rotate it" banner. Never throws.
    const passwordHealth = await assessPasswordHealth(password).catch(() => null);

    const response = NextResponse.json({
      message: "Signed in successfully.",
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
      // Omitted when assessment failed or password is fine.
      ...(passwordHealth && passwordHealth.severity !== "ok"
        ? { passwordHealth }
        : {}),
    });

    applyAuthCookies(response, accessJwt, refreshRaw);

    // The 2FA branch above returns early, so any login completing through this
    // path went via password-only. Two-factor completions are counted at the
    // 2FA verify endpoint with `had_2fa: "true"`.
    loginsTotal.inc({ channel: "password", had_2fa: "false" });
    void recordLoginAttempt({ req, email: loginId, succeeded: true, userId: user.id });
    void trackActiveUser(user.id);
    grantXP({ userId: user.id, action: "DAILY_LOGIN" }).catch(logBackgroundError("xp.grant.DAILY_LOGIN"));
    await writeAuditLog({
      action: "LOGIN_SUCCESS",
      actorUserId: user.id,
      targetType: "SESSION",
      targetId: sessionId,
      request: req,
    });

    notifyOnNewDeviceLogin({
      userId: user.id,
      email: user.email,
      recipientDisplay: user.displayName,
      appOrigin: process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin,
      newSessionId: sessionId,
      userAgent,
      ipAddress,
    }).catch(logBackgroundError("auth.login.newDeviceAlert"));

    return response;
  } catch (err) {
    // Log the underlying error so the next 500 isn't a black box. The user-
    // facing response stays generic because login-time errors can leak
    // existence of an account if echoed back (PII).
    logger.error(
      {
        scope: "auth.login",
        err: err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : { value: String(err) },
      },
      "login route threw",
    );
    return NextResponse.json(
      { error: "Server error." },
      { status: 500 },
    );
  }
});
