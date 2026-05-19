import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { resetPasswordBodySchema } from "@/lib/schemas/api-bodies";
import { pwnedPasswordIssue } from "@/lib/password-policy";

export async function POST(req: NextRequest) {
  const parsed = await parseRequestJson(req, resetPasswordBodySchema);
  if (!parsed.ok) return parsed.response;
  const token = parsed.data.token.trim();
  const newPassword = parsed.data.newPassword;

  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    select: { token: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Reset link is invalid or expired." },
      { status: 400 },
    );
  }

  const pwnedIssue = await pwnedPasswordIssue(newPassword);
  if (pwnedIssue) {
    return NextResponse.json({ error: pwnedIssue }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { token: record.token },
      data: { usedAt: new Date() },
    }),
    // Invalidate all other unused tokens for this user.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null, NOT: { token: record.token } },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ message: "Password has been reset." });
}

// Lightweight token validation (used by reset page on load).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ valid: false, error: "Missing token." }, { status: 400 });
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    select: { expiresAt: true, usedAt: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  return NextResponse.json({ valid: true, expiresAt: record.expiresAt });
}
