import { NextRequest, NextResponse } from "next/server";
import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
} from "@simplewebauthn/server";
import { applyAuthCookies } from "@/lib/auth-cookies";
import { verifyWebAuthnChallenge } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { createSessionAndIssueTokens } from "@/lib/refresh-session";
import { parseRequestJson } from "@/lib/request-json";
import { passkeyAuthenticationVerifySchema } from "@/lib/schemas/api-bodies";
import { webAuthnOrigins, webAuthnRpId } from "@/lib/webauthn";
import { writeAuditLog } from "@/lib/audit-log";
import { grantXP } from "@/lib/services/xp.service";
import { logBackgroundError } from "@/lib/logger";
import { clientIpFromRequest } from "@/lib/client-ip";

export async function POST(req: NextRequest) {
  const parsed = await parseRequestJson(req, passkeyAuthenticationVerifySchema);
  if (!parsed.ok) return parsed.response;

  const challenge = verifyWebAuthnChallenge(
    parsed.data.challengeToken,
    "webauthn-authentication",
  );
  if (!challenge) {
    return NextResponse.json({ error: "Passkey challenge expired. Try again." }, { status: 401 });
  }

  const response = parsed.data.response as AuthenticationResponseJSON;
  const credential = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: response.id },
    include: { user: true },
  });

  if (
    !credential ||
    credential.revokedAt ||
    (challenge.userId && credential.userId !== challenge.userId) ||
    credential.user.accountDeletionRequestedAt
  ) {
    return NextResponse.json({ error: "Passkey could not be verified." }, { status: 401 });
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge.challenge,
    expectedOrigin: webAuthnOrigins(req.nextUrl.origin),
    expectedRPID: webAuthnRpId(),
    credential: {
      id: credential.credentialId,
      publicKey: new Uint8Array(credential.publicKey),
      counter: Number(credential.counter),
      transports: credential.transports as AuthenticatorTransportFuture[],
    },
    requireUserVerification: false,
  });

  if (!verification.verified) {
    await writeAuditLog({
      action: "PASSKEY_LOGIN_FAILED",
      actorUserId: credential.userId,
      targetType: "WEBAUTHN_CREDENTIAL",
      targetId: credential.id,
      request: req,
    });
    return NextResponse.json({ error: "Passkey could not be verified." }, { status: 401 });
  }

  await prisma.webAuthnCredential.update({
    where: { id: credential.id },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      backedUp: verification.authenticationInfo.credentialBackedUp,
      lastUsedAt: new Date(),
    },
  });

  const userAgent = req.headers.get("user-agent") ?? null;
  const clientIp = clientIpFromRequest(req);
  const { sessionId, accessJwt, refreshRaw } = await createSessionAndIssueTokens({
    userId: credential.user.id,
    username: credential.user.username,
    email: credential.user.email,
    userAgent,
    ipAddress: clientIp !== "unknown" ? clientIp : null,
  });

  const out = NextResponse.json({
    message: "Signed in successfully.",
    user: {
      id: credential.user.id,
      username: credential.user.username,
      displayName: credential.user.displayName,
      avatarUrl: credential.user.avatarUrl,
    },
  });
  applyAuthCookies(out, accessJwt, refreshRaw);

  grantXP({ userId: credential.user.id, action: "DAILY_LOGIN" }).catch(logBackgroundError("xp.grant.DAILY_LOGIN"));
  await writeAuditLog({
    action: challenge.userId ? "PASSKEY_2FA_LOGIN_SUCCESS" : "PASSKEY_LOGIN_SUCCESS",
    actorUserId: credential.user.id,
    targetType: "SESSION",
    targetId: sessionId,
    metadata: { credentialId: credential.id },
    request: req,
  });

  return out;
}
