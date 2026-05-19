import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getUser } from "@/lib/auth";
import { logBackgroundError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { e2eePublishKeysSchema } from "@/lib/schemas/api-bodies";

const ONE_TIME_PREKEY_HARD_CAP = 200;

/**
 * POST /api/e2ee/keys — publish or rotate the caller's E2EE bundle.
 *
 * Server stores ONLY public material:
 *   - long-term identity signing key (ECDSA P-256)
 *   - long-term identity exchange key (ECDH P-256)
 *   - signed prekey + signature (rotated client-side)
 *   - up to 200 unconsumed one-time prekeys
 *
 * Calling this from a fresh device replaces the identity — any prior session
 * material is invalidated. Audit log captures the rotation event so a user
 * can see "your keys changed on …" in their security log.
 */
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, e2eePublishKeysSchema);
  if (!parsed.ok) return parsed.response;

  const data = parsed.data;
  const now = new Date();
  const signedCreatedAt = data.signedPreKey.createdAt
    ? new Date(data.signedPreKey.createdAt)
    : now;

  // Replace identity in a transaction with the prekey pool — keeps the bundle
  // internally consistent (no orphan one-time keys signed by a stale identity).
  await prisma.$transaction(async (tx) => {
    const existing = await tx.e2EEIdentity.findUnique({ where: { userId: me.userId } });
    const isRotation = Boolean(existing);

    await tx.e2EEIdentity.upsert({
      where: { userId: me.userId },
      create: {
        userId: me.userId,
        identitySigningKey: data.identitySigningKey,
        identityExchangeKey: data.identityExchangeKey,
        signedPreKeyId: data.signedPreKey.keyId,
        signedPreKeyPublic: data.signedPreKey.publicKey,
        signedPreKeySignature: data.signedPreKey.signature,
        signedPreKeyCreatedAt: signedCreatedAt,
      },
      update: {
        identitySigningKey: data.identitySigningKey,
        identityExchangeKey: data.identityExchangeKey,
        signedPreKeyId: data.signedPreKey.keyId,
        signedPreKeyPublic: data.signedPreKey.publicKey,
        signedPreKeySignature: data.signedPreKey.signature,
        signedPreKeyCreatedAt: signedCreatedAt,
      },
    });

    if (isRotation) {
      // Drop the old prekey pool — the new identity isn't trusted to vouch for them.
      await tx.e2EEOneTimePreKey.deleteMany({ where: { userId: me.userId } });
    }

    if (data.oneTimePreKeys.length > 0) {
      // Cap defensively in case the client is buggy.
      const slice = data.oneTimePreKeys.slice(0, ONE_TIME_PREKEY_HARD_CAP);
      await tx.e2EEOneTimePreKey.createMany({
        data: slice.map((p) => ({
          userId: me.userId,
          preKeyId: p.keyId,
          publicKey: p.publicKey,
        })),
        skipDuplicates: true,
      });
    }

    return isRotation;
  });

  const remaining = await prisma.e2EEOneTimePreKey.count({
    where: { userId: me.userId, consumedAt: null },
  });

  await writeAuditLog({
    action: "E2EE_KEYS_PUBLISHED",
    actorUserId: me.userId,
    targetType: "E2EE_IDENTITY",
    targetId: me.userId,
    request: req,
    metadata: {
      signedPreKeyId: data.signedPreKey.keyId,
      uploadedOneTimePreKeys: data.oneTimePreKeys.length,
      remainingOneTimePreKeys: remaining,
    },
  }).catch(logBackgroundError("e2ee.keys.audit"));

  return NextResponse.json({ ok: true, remainingOneTimePreKeys: remaining }, { status: 201 });
}

/** GET /api/e2ee/keys — own bundle (so a re-mounted client can detect rotation). */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const identity = await prisma.e2EEIdentity.findUnique({
    where: { userId: me.userId },
    select: {
      identitySigningKey: true,
      identityExchangeKey: true,
      signedPreKeyId: true,
      signedPreKeyPublic: true,
      signedPreKeySignature: true,
      signedPreKeyCreatedAt: true,
      updatedAt: true,
    },
  });

  if (!identity) {
    return NextResponse.json({ identity: null, remainingOneTimePreKeys: 0 });
  }

  const remaining = await prisma.e2EEOneTimePreKey.count({
    where: { userId: me.userId, consumedAt: null },
  });

  return NextResponse.json({
    identity: {
      ...identity,
      signedPreKeyCreatedAt: identity.signedPreKeyCreatedAt.toISOString(),
      updatedAt: identity.updatedAt.toISOString(),
    },
    remainingOneTimePreKeys: remaining,
  });
}
