import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { areUsersBlocked } from "@/lib/user-blocks";

/**
 * GET /api/e2ee/keys/[userId] — fetch a peer's key bundle for X3DH.
 *
 * Atomically claims one unused one-time prekey (`consumedAt = now()`) inside
 * a SERIALIZABLE-isolated transaction so the same prekey is never handed to
 * two initiators. If the pool is empty, returns the bundle without a
 * one-time prekey — the X3DH session falls back to identity + signed prekey
 * only (forward secrecy guarantee at session start is then weaker).
 *
 * Block check matches the messaging policy: viewer can't pull the bundle of
 * a user who has blocked them or vice versa.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { userId } = await params;
  if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 400 });

  if (userId !== me.userId && (await areUsersBlocked(me.userId, userId))) {
    return NextResponse.json({ error: "User unavailable." }, { status: 403 });
  }

  const identity = await prisma.e2EEIdentity.findUnique({
    where: { userId },
    select: {
      identitySigningKey: true,
      identityExchangeKey: true,
      signedPreKeyId: true,
      signedPreKeyPublic: true,
      signedPreKeySignature: true,
      signedPreKeyCreatedAt: true,
    },
  });
  if (!identity) {
    return NextResponse.json({ error: "User has no E2EE identity." }, { status: 404 });
  }

  // Atomically reserve a one-time prekey if any are available.
  const oneTime = await prisma.$transaction(async (tx) => {
    const candidate = await tx.e2EEOneTimePreKey.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, preKeyId: true, publicKey: true },
    });
    if (!candidate) return null;

    // Race-safe claim: updateMany filtered by `consumedAt: null` returns 0 if
    // another concurrent fetch already grabbed it; we just retry-by-omission.
    const claim = await tx.e2EEOneTimePreKey.updateMany({
      where: { id: candidate.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claim.count === 0) return null;

    return { keyId: candidate.preKeyId, publicKey: candidate.publicKey };
  });

  return NextResponse.json({
    bundle: {
      userId,
      identitySigningKey: identity.identitySigningKey,
      identityExchangeKey: identity.identityExchangeKey,
      signedPreKey: {
        keyId: identity.signedPreKeyId,
        publicKey: identity.signedPreKeyPublic,
        signature: identity.signedPreKeySignature,
        createdAt: identity.signedPreKeyCreatedAt.toISOString(),
      },
      oneTimePreKey: oneTime,
    },
  });
}
