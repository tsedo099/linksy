import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { verifyEmailBodySchema } from "@/lib/schemas/api-bodies";

export async function POST(req: NextRequest) {
  const parsed = await parseRequestJson(req, verifyEmailBodySchema);
  if (!parsed.ok) return parsed.response;
  const token = parsed.data.token.trim();

  const record = await prisma.emailVerificationToken.findUnique({
    where: { token },
    select: { token: true, userId: true, email: true, expiresAt: true, usedAt: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Verification link is invalid or expired." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: record.userId },
    select: { id: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Email might have changed since the token was issued — verify only if it still matches.
  if (user.email !== record.email) {
    return NextResponse.json(
      { error: "Email no longer matches. Please request a new verification link." },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    }),
    prisma.emailVerificationToken.update({
      where: { token: record.token },
      data: { usedAt: new Date() },
    }),
    // Invalidate other unused tokens for this user.
    prisma.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null, NOT: { token: record.token } },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ message: "Email verified successfully." });
}

// Lightweight token validation (used by verify page on load).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();

  if (!token) {
    return NextResponse.json({ valid: false, error: "Missing token." }, { status: 400 });
  }

  const record = await prisma.emailVerificationToken.findUnique({
    where: { token },
    select: { expiresAt: true, usedAt: true },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  return NextResponse.json({ valid: true, expiresAt: record.expiresAt });
}
