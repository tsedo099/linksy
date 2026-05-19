import "server-only";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIpFromRequest } from "@/lib/client-ip";
import { logBackgroundError } from "@/lib/logger";

/**
 * Append-only forensic log of authentication attempts. Writes are
 * fire-and-forget — failures here must never block the auth flow, so
 * the caller awaits at most a low-priority promise and we swallow + log
 * any database error to `pino` rather than rethrowing.
 *
 * Use {@link recordLoginAttempt} from every code path that resolves a
 * login decision — successful login, password mismatch, 2FA required,
 * account locked, rate-limit hit, deleted/deactivated account, OAuth-only
 * account, etc. The `failureReason` strings are part of the
 * `model LoginAttempt` contract; keep them stable across deploys so the
 * forensics queries the security team uses don't break.
 */

export type LoginAttemptFailureReason =
  | "no_user"
  | "bad_password"
  | "locked"
  | "rate_limited"
  | "2fa_required"
  | "2fa_failed"
  | "deactivated"
  | "deleted"
  | "oauth_only"
  | "unknown";

export type LoginAttemptChannel =
  | "password"
  | "totp"
  | "backup_code"
  | "passkey"
  | "oauth_google";

export function recordLoginAttempt(input: {
  req: NextRequest;
  email: string;
  channel?: LoginAttemptChannel;
  succeeded: boolean;
  failureReason?: LoginAttemptFailureReason | null;
  userId?: string | null;
}): Promise<unknown> {
  const ip = clientIpFromRequest(input.req);
  const ipAddress = ip && ip !== "unknown" ? ip : null;
  const userAgent = input.req.headers.get("user-agent")?.slice(0, 500) ?? null;

  return prisma.loginAttempt
    .create({
      data: {
        email: input.email.trim().toLowerCase().slice(0, 254),
        ipAddress,
        userAgent,
        channel: input.channel ?? "password",
        succeeded: input.succeeded,
        failureReason: input.succeeded ? null : (input.failureReason ?? "unknown"),
        userId: input.userId ?? null,
      },
    })
    .catch(logBackgroundError("auth.loginAttempt.write"));
}
