import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { buildOtpauthUrl, generateSecret } from "@/lib/totp";
import { writeAuditLog } from "@/lib/audit-log";

// POST /api/auth/2fa/setup - begin enabling TOTP-based 2FA for the current user
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: me.userId },
    select: { id: true, email: true, username: true, twoFactorEnabled: true, twoFactorSecretRecord: { select: { id: true } } },
  });

  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (user.twoFactorEnabled || user.twoFactorSecretRecord) {
    return NextResponse.json({ error: "Two-factor is already enabled." }, { status: 409 });
  }

  const secret = generateSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { pendingTwoFactorSecret: secret },
  });
  await writeAuditLog({
    action: "TWO_FACTOR_SETUP_STARTED",
    actorUserId: user.id,
    targetType: "USER",
    targetId: user.id,
    request: req,
  });

  const otpauthUrl = buildOtpauthUrl({
    secret,
    accountName: user.email || user.username,
    issuer: "Linksy",
  });

  return NextResponse.json({ secret, otpauthUrl });
}
