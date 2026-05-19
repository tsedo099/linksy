import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";
import { generateBackupCodes } from "@/lib/two-factor";
import { writeAuditLog } from "@/lib/audit-log";
import { parseRequestJson } from "@/lib/request-json";
import { twoFactorBackupCodesBodySchema } from "@/lib/schemas/api-bodies";

export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const secret = await prisma.twoFactorSecret.findUnique({
    where: { userId: me.userId },
    select: { backupCodes: true },
  });

  if (!secret) {
    return NextResponse.json({ error: "Two-factor is not enabled." }, { status: 400 });
  }

  return NextResponse.json({ remaining: secret.backupCodes.length });
}

export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, twoFactorBackupCodesBodySchema);
  if (!parsed.ok) return parsed.response;
  const code = parsed.data.code.trim();

  const twoFactor = await prisma.twoFactorSecret.findUnique({
    where: { userId: me.userId },
    select: { secret: true },
  });
  if (!twoFactor) {
    return NextResponse.json({ error: "Two-factor is not enabled." }, { status: 400 });
  }
  if (!verifyTotp(twoFactor.secret, code)) {
    return NextResponse.json({ error: "Invalid authentication code." }, { status: 401 });
  }

  const backupCodes = generateBackupCodes();
  await prisma.twoFactorSecret.update({
    where: { userId: me.userId },
    data: { backupCodes },
  });
  await writeAuditLog({
    action: "TWO_FACTOR_BACKUP_CODES_REGENERATED",
    actorUserId: me.userId,
    targetType: "USER",
    targetId: me.userId,
    request: req,
  });

  return NextResponse.json({ backupCodes });
}
