import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { verifyTwoFactorChallenge, signWebAuthnChallenge } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { passkeyAuthenticationOptionsSchema } from "@/lib/schemas/api-bodies";
import { toCredentialDescriptor, webAuthnRpId } from "@/lib/webauthn";
import { consumeRateLimit, AUTH_LOGIN_IP_LIMIT } from "@/lib/rate-limit";
import { clientIpFromRequest } from "@/lib/client-ip";

function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many passkey attempts. Please try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function POST(req: NextRequest) {
  const ipLimit = await consumeRateLimit(
    "auth:passkey:options:ip",
    clientIpFromRequest(req),
    AUTH_LOGIN_IP_LIMIT,
  );
  if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfterSeconds);

  const parsed = await parseRequestJson(req, passkeyAuthenticationOptionsSchema);
  if (!parsed.ok) return parsed.response;

  let userId: string | undefined;
  let allowCredentials: ReturnType<typeof toCredentialDescriptor>[] | undefined;

  if (parsed.data.challengeToken) {
    const challenge = verifyTwoFactorChallenge(parsed.data.challengeToken);
    if (!challenge) {
      return NextResponse.json({ error: "Challenge expired. Sign in again." }, { status: 401 });
    }
    userId = challenge.userId;
  } else if (parsed.data.usernameOrEmail) {
    const identifier = parsed.data.usernameOrEmail.trim();
    const user = identifier.includes("@")
      ? await prisma.user.findUnique({ where: { email: identifier } })
      : await prisma.user.findUnique({ where: { username: identifier } });
    userId = user?.id;
  }

  if (userId) {
    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId, revokedAt: null },
      select: { credentialId: true, transports: true },
    });
    if (credentials.length === 0) {
      return NextResponse.json({ error: "No passkeys found for this account." }, { status: 404 });
    }
    allowCredentials = credentials.map(toCredentialDescriptor);
  }

  const options = await generateAuthenticationOptions({
    rpID: webAuthnRpId(),
    userVerification: "preferred",
    allowCredentials,
  });

  return NextResponse.json({
    options,
    challengeToken: signWebAuthnChallenge({
      purpose: "webauthn-authentication",
      userId,
      challenge: options.challenge,
    }),
  });
}
