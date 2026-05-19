import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { getUser } from "@/lib/auth";
import { signWebAuthnChallenge } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import {
  toCredentialDescriptor,
  userIdToWebAuthnUserId,
  webAuthnRpId,
  webAuthnRpName,
} from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const existing = await prisma.webAuthnCredential.findMany({
    where: { userId: me.userId, revokedAt: null },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName: webAuthnRpName(),
    rpID: webAuthnRpId(),
    userID: userIdToWebAuthnUserId(me.userId),
    userName: me.username,
    userDisplayName: me.username,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    excludeCredentials: existing.map(toCredentialDescriptor),
  });

  return NextResponse.json({
    options,
    challengeToken: signWebAuthnChallenge({
      purpose: "webauthn-registration",
      userId: me.userId,
      challenge: options.challenge,
    }),
  });
}
