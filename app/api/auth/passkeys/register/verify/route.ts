import { NextRequest, NextResponse } from "next/server";
import {
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getUser } from "@/lib/auth";
import { verifyWebAuthnChallenge } from "@/lib/jwt";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { passkeyRegistrationVerifySchema } from "@/lib/schemas/api-bodies";
import { normalizeCredentialName, webAuthnOrigins, webAuthnRpId } from "@/lib/webauthn";
import { writeAuditLog } from "@/lib/audit-log";

export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, passkeyRegistrationVerifySchema);
  if (!parsed.ok) return parsed.response;

  const challenge = verifyWebAuthnChallenge(
    parsed.data.challengeToken,
    "webauthn-registration",
  );
  if (!challenge || challenge.userId !== me.userId) {
    return NextResponse.json({ error: "Passkey setup expired. Try again." }, { status: 401 });
  }

  const verification = await verifyRegistrationResponse({
    response: parsed.data.response as RegistrationResponseJSON,
    expectedChallenge: challenge.challenge,
    expectedOrigin: webAuthnOrigins(req.nextUrl.origin),
    expectedRPID: webAuthnRpId(),
    requireUserVerification: false,
  });

  if (!verification.verified) {
    return NextResponse.json({ error: "Passkey could not be verified." }, { status: 400 });
  }

  const { credential, aaguid, credentialBackedUp } = verification.registrationInfo;
  const row = await prisma.webAuthnCredential.create({
    data: {
      userId: me.userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: credential.transports ?? [],
      aaguid,
      backedUp: credentialBackedUp,
      name: normalizeCredentialName(parsed.data.name) ?? "Passkey",
    },
    select: { id: true },
  });

  await writeAuditLog({
    action: "PASSKEY_REGISTERED",
    actorUserId: me.userId,
    targetType: "WEBAUTHN_CREDENTIAL",
    targetId: row.id,
    request: req,
  });

  return NextResponse.json({ message: "Passkey added.", credentialId: row.id });
}
