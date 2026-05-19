import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";
import { writeAuditLog } from "@/lib/audit-log";
import { parseRequestJson } from "@/lib/request-json";
import { twoFactorDisableBodySchema } from "@/lib/schemas/api-bodies";

// POST /api/auth/2fa/disable - turn off TOTP-based 2FA after re-confirming a code
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, twoFactorDisableBodySchema);
  if (!parsed.ok) return parsed.response;
  const code = parsed.data.code.trim();

  const user = await prisma.user.findUnique({
    where: { id: me.userId },
    select: {
      id: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
      twoFactorSecretRecord: { select: { secret: true } },
    },
  });

  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const effectiveSecret = user.twoFactorSecretRecord?.secret ?? user.twoFactorSecret ?? null;
  if (!user.twoFactorEnabled || !effectiveSecret) {
    return NextResponse.json({ error: "Two-factor is not enabled." }, { status: 400 });
  }

  if (!verifyTotp(effectiveSecret, code)) {
    return NextResponse.json({ error: "Invalid authentication code." }, { status: 401 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        pendingTwoFactorSecret: null,
      },
    }),
    prisma.twoFactorSecret.deleteMany({ where: { userId: user.id } }),
  ]);
  await writeAuditLog({
    action: "TWO_FACTOR_DISABLED",
    actorUserId: user.id,
    targetType: "USER",
    targetId: user.id,
    request: req,
  });

  return NextResponse.json({ message: "Two-factor authentication disabled." });
}
