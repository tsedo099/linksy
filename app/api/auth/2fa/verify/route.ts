import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import {
  verifyTwoFactorChallenge,
} from "@/lib/jwt";
import { applyAuthCookies } from "@/lib/auth-cookies";
import { createSessionAndIssueTokens } from "@/lib/refresh-session";
import { verifyTotp } from "@/lib/totp";
import { grantXP } from "@/lib/services/xp.service";
import { generateBackupCodes, isBackupCode, normalizeBackupCode } from "@/lib/two-factor";
import { writeAuditLog } from "@/lib/audit-log";
import { logBackgroundError } from "@/lib/logger";
import { parseRequestJson } from "@/lib/request-json";
import { twoFactorVerifyBodySchema } from "@/lib/schemas/api-bodies";
import { notifyOnNewDeviceLogin } from "@/lib/email-templates";
import { recordLoginAttempt } from "@/lib/login-attempts";
import { loginsTotal } from "@/lib/metrics";
import { trackActiveUser } from "@/lib/active-users";

// POST /api/auth/2fa/verify
// Two flows:
//   1) Setup confirmation: authenticated user with pendingTwoFactorSecret submits a code
//      to enable 2FA on their account.
//   2) Login challenge: anonymous client posts { challengeToken, code } from a prior
//      login attempt where the user has 2FA enabled. On success we issue the real cookie
//      and create a Session row.
export async function POST(req: NextRequest) {
  const parsed = await parseRequestJson(req, twoFactorVerifyBodySchema);
  if (!parsed.ok) return parsed.response;
  const code = parsed.data.code.trim();
  const challengeToken = parsed.data.challengeToken?.trim();

  // Login challenge flow
  if (challengeToken) {
    const challenge = verifyTwoFactorChallenge(challengeToken);
    if (!challenge) {
      return NextResponse.json({ error: "Challenge expired. Sign in again." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: challenge.userId },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        accountDeletionRequestedAt: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorSecretRecord: {
          select: {
            id: true,
            secret: true,
            backupCodes: true,
          },
        },
      },
    });

    const effectiveSecret = user?.twoFactorSecretRecord?.secret ?? user?.twoFactorSecret ?? null;

    if (!user || !user.twoFactorEnabled || !effectiveSecret) {
      return NextResponse.json({ error: "Two-factor is not enabled." }, { status: 400 });
    }

    if (user.accountDeletionRequestedAt) {
      return NextResponse.json(
        { error: "This account is closed and scheduled for deletion." },
        { status: 403 },
      );
    }

    let usedBackupCode = false;
    let nextBackupCodes = user.twoFactorSecretRecord?.backupCodes ?? [];

    const validTotp = verifyTotp(effectiveSecret, code);
    if (!validTotp) {
      if (!isBackupCode(code) || !user.twoFactorSecretRecord) {
        await writeAuditLog({
          action: "TWO_FACTOR_LOGIN_FAILED",
          actorUserId: user.id,
          targetType: "USER",
          targetId: user.id,
          metadata: { reason: "INVALID_CODE" },
          request: req,
        });
        void recordLoginAttempt({ req, email: user.email, channel: "totp", succeeded: false, failureReason: "2fa_failed", userId: user.id });
        return NextResponse.json({ error: "Invalid authentication code." }, { status: 401 });
      }
      const normalizedInput = normalizeBackupCode(code);
      const matched = nextBackupCodes.find((item) => normalizeBackupCode(item) === normalizedInput);
      if (!matched) {
        await writeAuditLog({
          action: "TWO_FACTOR_LOGIN_FAILED",
          actorUserId: user.id,
          targetType: "USER",
          targetId: user.id,
          metadata: { reason: "INVALID_BACKUP_CODE" },
          request: req,
        });
        void recordLoginAttempt({ req, email: user.email, channel: "backup_code", succeeded: false, failureReason: "2fa_failed", userId: user.id });
        return NextResponse.json({ error: "Invalid authentication code." }, { status: 401 });
      }
      usedBackupCode = true;
      nextBackupCodes = nextBackupCodes.filter((item) => normalizeBackupCode(item) !== normalizedInput);
      await prisma.twoFactorSecret.update({
        where: { userId: user.id },
        data: { backupCodes: nextBackupCodes },
      });
    }

    if (!validTotp && !usedBackupCode) {
      return NextResponse.json({ error: "Invalid authentication code." }, { status: 401 });
    }

    const userAgent = req.headers.get("user-agent") ?? null;
    const forwarded = req.headers.get("x-forwarded-for");
    const ipAddress = forwarded
      ? forwarded.split(",")[0]?.trim() || null
      : req.headers.get("x-real-ip") ?? null;

    const { sessionId, accessJwt, refreshRaw } = await createSessionAndIssueTokens({
      userId: user.id,
      username: user.username,
      email: user.email,
      userAgent,
      ipAddress,
    });

    const response = NextResponse.json({
      message: "Signed in successfully.",
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      },
    });

    applyAuthCookies(response, accessJwt, refreshRaw);

    grantXP({ userId: user.id, action: "DAILY_LOGIN" }).catch(logBackgroundError("xp.grant.DAILY_LOGIN"));
    await writeAuditLog({
      action: usedBackupCode ? "TWO_FACTOR_LOGIN_SUCCESS_BACKUP_CODE" : "TWO_FACTOR_LOGIN_SUCCESS",
      actorUserId: user.id,
      targetType: "SESSION",
      targetId: sessionId,
      metadata: usedBackupCode
        ? { backupCodesRemaining: nextBackupCodes.length }
        : null,
      request: req,
    });

    if (usedBackupCode && nextBackupCodes.length === 0) {
      response.headers.set("X-Linksy-Backup-Codes-Empty", "true");
    }

    loginsTotal.inc({ channel: usedBackupCode ? "backup_code" : "totp", had_2fa: "true" });
    void recordLoginAttempt({
      req,
      email: user.email,
      channel: usedBackupCode ? "backup_code" : "totp",
      succeeded: true,
      userId: user.id,
    });
    void trackActiveUser(user.id);

    notifyOnNewDeviceLogin({
      userId: user.id,
      email: user.email,
      recipientDisplay: user.displayName,
      appOrigin: process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin,
      newSessionId: sessionId,
      userAgent,
      ipAddress,
    }).catch(logBackgroundError("auth.2fa.newDeviceAlert"));

    return response;
  }

  // Setup confirmation flow
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: me.userId },
    select: {
      id: true,
      twoFactorEnabled: true,
      pendingTwoFactorSecret: true,
    },
  });

  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (user.twoFactorEnabled) {
    return NextResponse.json({ error: "Two-factor is already enabled." }, { status: 409 });
  }

  if (!user.pendingTwoFactorSecret) {
    return NextResponse.json(
      { error: "Run setup before verifying a code." },
      { status: 400 },
    );
  }

  if (!verifyTotp(user.pendingTwoFactorSecret, code)) {
    return NextResponse.json({ error: "Invalid authentication code." }, { status: 401 });
  }

  const backupCodes = generateBackupCodes();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: true,
      twoFactorSecret: user.pendingTwoFactorSecret,
      pendingTwoFactorSecret: null,
    },
  });
  await prisma.twoFactorSecret.upsert({
    where: { userId: user.id },
    update: {
      secret: user.pendingTwoFactorSecret,
      backupCodes,
    },
    create: {
      userId: user.id,
      secret: user.pendingTwoFactorSecret,
      backupCodes,
    },
  });
  await writeAuditLog({
    action: "TWO_FACTOR_ENABLED",
    actorUserId: user.id,
    targetType: "USER",
    targetId: user.id,
    request: req,
  });

  return NextResponse.json({ message: "Two-factor authentication enabled.", backupCodes });
}
