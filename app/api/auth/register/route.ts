import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { parseAppLanguage } from "@/lib/language";
import { applyAuthCookies } from "@/lib/auth-cookies";
import { createSessionAndIssueTokens } from "@/lib/refresh-session";
import { clientIpFromRequest } from "@/lib/client-ip";
import { parseRequestJson } from "@/lib/request-json";
import { registerBodySchema } from "@/lib/schemas/api-bodies";
import { sendWelcomeEmail } from "@/lib/email-templates";
import { logBackgroundError } from "@/lib/logger";
import { notifyContactOwnersOnJoin } from "@/lib/notify-friend-join";
import { isValidIanaTimezone } from "@/lib/push/quiet-hours";
import { pwnedPasswordIssue } from "@/lib/password-policy";
import { signupsTotal } from "@/lib/metrics";
import { withMetrics } from "@/lib/with-metrics";
import { logger } from "@/lib/logger";

export const POST = withMetrics("/api/auth/register", async (req: NextRequest) => {
  try {
    const parsed = await parseRequestJson(req, registerBodySchema);
    if (!parsed.ok) return parsed.response;
    const {
      username,
      email,
      password,
      displayName,
      preferredLanguage: preferredLanguageRaw,
      timezone: timezoneRaw,
      birthDate: birthDateRaw,
      gender,
    } = parsed.data;
    const preferredLanguage = parseAppLanguage(preferredLanguageRaw ?? undefined);
    const rawTz = typeof timezoneRaw === "string" ? timezoneRaw.trim() : "";
    const quietTz = rawTz && isValidIanaTimezone(rawTz) ? rawTz : "UTC";
    // Schema already validated YYYY-MM-DD ≤ today and ≥ 1900, so this never NaNs.
    const birthDate = new Date(birthDateRaw);

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      const field = existing.email === email ? "Email" : "Username";
      return NextResponse.json(
        { error: `${field} is already taken.` },
        { status: 409 }
      );
    }

    const pwnedIssue = await pwnedPasswordIssue(password);
    if (pwnedIssue) {
      return NextResponse.json({ error: pwnedIssue }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        displayName,
        preferredLanguage,
        quietHoursStart: 22 * 60,
        quietHoursEnd: 7 * 60,
        quietHoursTimezone: quietTz,
        birthDate,
        gender,
      },
    });

    notifyContactOwnersOnJoin(user.id, email).catch(logBackgroundError("auth.register.contactNotify"));

    const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;
    sendWelcomeEmail(user.email, {
      appOrigin,
      recipientDisplay: user.displayName,
      locale: preferredLanguage,
    }).catch(logBackgroundError("auth.register.welcomeEmail"));

    const userAgent = req.headers.get("user-agent") ?? null;
    const clientIp = clientIpFromRequest(req);
    const ipAddress = clientIp !== "unknown" ? clientIp : null;

    const { accessJwt, refreshRaw } = await createSessionAndIssueTokens({
      userId: user.id,
      username: user.username,
      email: user.email,
      userAgent,
      ipAddress,
    });

    const response = NextResponse.json(
      { message: "Account created successfully.", userId: user.id },
      { status: 201 },
    );

    applyAuthCookies(response, accessJwt, refreshRaw);

    signupsTotal.inc({ channel: "email" });
    return response;
  } catch (err) {
    const e = err as { code?: string; message?: string; meta?: unknown };
    logger.error(
      {
        scope: "auth.register",
        errCode: e.code,
        errMessage: e.message?.slice(0, 500),
        errMeta: e.meta,
      },
      "register.failed",
    );
    return NextResponse.json(
      { error: "Server error." },
      { status: 500 }
    );
  }
});
