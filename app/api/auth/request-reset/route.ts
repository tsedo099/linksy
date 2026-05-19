import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { parseAppLanguage } from "@/lib/language";
import { sendPasswordResetEmail } from "@/lib/email-templates";
import { PASSWORD_RESET_ISSUE_LIMIT } from "@/lib/rate-limit";
import { logBackgroundError } from "@/lib/logger";
import { parseRequestJson } from "@/lib/request-json";
import { requestResetBodySchema } from "@/lib/schemas/api-bodies";

const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function POST(req: NextRequest) {
  const parsed = await parseRequestJson(req, requestResetBodySchema);
  if (!parsed.ok) return parsed.response;
  const email = parsed.data.email.trim().toLowerCase();

  // Always respond with success to prevent email enumeration.
  const successResponse = NextResponse.json({
    message: "If an account exists for this email, a reset link has been sent.",
  });

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      username: true,
      email: true,
      preferredLanguage: true,
      accountDeletionRequestedAt: true,
      passwordHash: true,
    },
  });

  if (!user) return successResponse;
  if (user.accountDeletionRequestedAt) return successResponse;
  if (!user.passwordHash) return successResponse;

  // Rate limit: max 3 active reset tokens issued in last 15 min per user.
  const recentTokens = await prisma.passwordResetToken.count({
    where: {
      userId: user.id,
      createdAt: { gte: new Date(Date.now() - PASSWORD_RESET_ISSUE_LIMIT.windowMs) },
    },
  });

  if (recentTokens >= PASSWORD_RESET_ISSUE_LIMIT.maxAttempts) {
    return successResponse;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.passwordResetToken.create({
    data: { token, userId: user.id, expiresAt },
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
  const resetUrl = `${origin}/auth/reset/${token}`;

  try {
    await sendPasswordResetEmail(user.email, {
      recipientUsername: user.username,
      resetUrl,
      ttlMinutes: 30,
      locale: parseAppLanguage(user.preferredLanguage),
    });
  } catch (error) {
    // Keep anti-enumeration behavior: do not surface delivery failures to the client.
    logBackgroundError("auth.request-reset.email")(error);
    await prisma.passwordResetToken.delete({ where: { token } }).catch(() => undefined);
  }

  return successResponse;
}
