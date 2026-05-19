import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { areUsersBlocked } from "@/lib/user-blocks";
import { parseRequestJson } from "@/lib/request-json";
import { z } from "zod";
import { createHash } from "node:crypto";

/**
 * Identity-key fingerprint used to detect rotation. The same scheme runs on
 * client and server so they agree on whether the previously-verified
 * identity is still in force.
 */
function fingerprintIdentity(identitySigningKeyBase64: string): string {
  return createHash("sha256").update(identitySigningKeyBase64).digest("hex");
}

/**
 * GET /api/e2ee/verification/[peerUserId]
 *
 * Returns the verification status for the (me, peer) pair plus the peer's
 * current identity-key fingerprint, so the client can render the safety
 * number and compare against any stored "verified at this fingerprint" row.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ peerUserId: string }> },
) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { peerUserId } = await params;
  if (!peerUserId) return NextResponse.json({ error: "peerUserId is required." }, { status: 400 });
  if (peerUserId === me.userId) {
    return NextResponse.json({ error: "Cannot verify yourself." }, { status: 400 });
  }
  if (await areUsersBlocked(me.userId, peerUserId)) {
    return NextResponse.json({ error: "User unavailable." }, { status: 403 });
  }

  const [peerIdentity, myIdentity, verification] = await Promise.all([
    prisma.e2EEIdentity.findUnique({
      where: { userId: peerUserId },
      select: { identitySigningKey: true },
    }),
    prisma.e2EEIdentity.findUnique({
      where: { userId: me.userId },
      select: { identitySigningKey: true },
    }),
    prisma.e2EEVerification.findUnique({
      where: { userId_peerUserId: { userId: me.userId, peerUserId } },
    }),
  ]);

  if (!peerIdentity || !myIdentity) {
    return NextResponse.json({ error: "Peer has no E2EE identity yet." }, { status: 404 });
  }

  const currentFingerprint = fingerprintIdentity(peerIdentity.identitySigningKey);
  const stale = verification ? verification.peerIdentityFingerprint !== currentFingerprint : false;

  return NextResponse.json({
    me: {
      userId: me.userId,
      identitySigningKey: myIdentity.identitySigningKey,
    },
    peer: {
      userId: peerUserId,
      identitySigningKey: peerIdentity.identitySigningKey,
      identityFingerprint: currentFingerprint,
    },
    verification: verification
      ? {
          verifiedAt: verification.verifiedAt.toISOString(),
          stale: stale || verification.stale,
          previousFingerprint: verification.peerIdentityFingerprint,
        }
      : null,
  });
}

const postSchema = z.object({
  /** The fingerprint the caller saw when they marked the verification. Must match server's current view. */
  peerIdentityFingerprint: z.string().min(1).max(128),
});

/**
 * POST /api/e2ee/verification/[peerUserId]
 *
 * Mark this conversation as verified. The client computes the safety number,
 * shows it to the user, and on confirmation POSTs back with the fingerprint
 * it observed; the server stores the row only if the fingerprint still
 * matches the peer's current identity (defends against key rotation racing
 * the verification click).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ peerUserId: string }> },
) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { peerUserId } = await params;
  if (!peerUserId) return NextResponse.json({ error: "peerUserId is required." }, { status: 400 });
  if (peerUserId === me.userId) {
    return NextResponse.json({ error: "Cannot verify yourself." }, { status: 400 });
  }
  if (await areUsersBlocked(me.userId, peerUserId)) {
    return NextResponse.json({ error: "User unavailable." }, { status: 403 });
  }

  const parsed = await parseRequestJson(req, postSchema);
  if (!parsed.ok) return parsed.response;

  const peerIdentity = await prisma.e2EEIdentity.findUnique({
    where: { userId: peerUserId },
    select: { identitySigningKey: true },
  });
  if (!peerIdentity) {
    return NextResponse.json({ error: "Peer has no E2EE identity yet." }, { status: 404 });
  }
  const currentFingerprint = fingerprintIdentity(peerIdentity.identitySigningKey);
  if (currentFingerprint !== parsed.data.peerIdentityFingerprint) {
    return NextResponse.json(
      { error: "Peer's identity key has changed since you started verifying. Re-open and try again." },
      { status: 409 },
    );
  }

  await prisma.e2EEVerification.upsert({
    where: { userId_peerUserId: { userId: me.userId, peerUserId } },
    create: {
      userId: me.userId,
      peerUserId,
      peerIdentityFingerprint: currentFingerprint,
    },
    update: {
      peerIdentityFingerprint: currentFingerprint,
      verifiedAt: new Date(),
      stale: false,
    },
  });

  return NextResponse.json({ ok: true, peerIdentityFingerprint: currentFingerprint });
}

/**
 * DELETE /api/e2ee/verification/[peerUserId] — revoke verification (e.g. user
 * notices their peer's fingerprint changed and wants to mark the conversation
 * as unverified pending re-check).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ peerUserId: string }> },
) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { peerUserId } = await params;
  if (!peerUserId) return NextResponse.json({ error: "peerUserId is required." }, { status: 400 });

  await prisma.e2EEVerification.deleteMany({
    where: { userId: me.userId, peerUserId },
  });
  return NextResponse.json({ ok: true });
}
