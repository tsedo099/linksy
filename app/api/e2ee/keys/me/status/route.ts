import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** GET /api/e2ee/keys/me/status — counts so the client knows when to refresh. */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const identity = await prisma.e2EEIdentity.findUnique({
    where: { userId: me.userId },
    select: { signedPreKeyCreatedAt: true, updatedAt: true },
  });

  const remaining = identity
    ? await prisma.e2EEOneTimePreKey.count({ where: { userId: me.userId, consumedAt: null } })
    : 0;
  const consumed = identity
    ? await prisma.e2EEOneTimePreKey.count({ where: { userId: me.userId, consumedAt: { not: null } } })
    : 0;

  return NextResponse.json({
    hasIdentity: Boolean(identity),
    remainingOneTimePreKeys: remaining,
    consumedOneTimePreKeys: consumed,
    signedPreKeyAgeDays: identity
      ? Math.floor((Date.now() - identity.signedPreKeyCreatedAt.getTime()) / (24 * 60 * 60 * 1000))
      : null,
  });
}
