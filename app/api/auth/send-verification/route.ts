import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { parseAppLanguage } from "@/lib/language";
import { sendVerificationEmail } from "@/lib/email-templates";
import { EMAIL_VERIFICATION_SEND_LIMIT } from "@/lib/rate-limit";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: me.userId },
    select: { id: true, email: true, emailVerified: true, displayName: true, preferredLanguage: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (user.emailVerified) {
    return NextResponse.json({ error: "Email is already verified." }, { status: 400 });
  }

  const recentTokens = await prisma.emailVerificationToken.count({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.now() - EMAIL_VERIFICATION_SEND_LIMIT.windowMs) },
    },
  });

  if (recentTokens >= EMAIL_VERIFICATION_SEND_LIMIT.maxAttempts) {
    return NextResponse.json(
      { error: "Too many verification emails. Please try again later." },
      { status: 429 },
    );
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.emailVerificationToken.create({
    data: { token, userId: user.id, email: user.email, expiresAt },
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
  const verificationUrl = `${origin}/auth/verify-email/${token}`;

  try {
    await sendVerificationEmail(user.email, {
      recipientDisplay: user.displayName,
      verifyUrl: verificationUrl,
      ttlHours: 24,
      locale: parseAppLanguage(user.preferredLanguage),
    });
  } catch (error) {
    await prisma.emailVerificationToken.delete({ where: { token } }).catch(() => undefined);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send verification email." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    message: "Verification email sent. Please check your inbox.",
  });
}
