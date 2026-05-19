import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendDigestForUser } from "@/lib/email-digest";
import { consumeRateLimit } from "@/lib/rate-limit";

const DIGEST_SEND_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const DIGEST_SEND_MAX = 3;

export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const limited = await consumeRateLimit("digest-send", me.userId, {
    windowMs: DIGEST_SEND_WINDOW_MS,
    max: DIGEST_SEND_MAX,
  });

  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many digest requests. Please wait a few minutes." },
      { status: 429 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: me.userId },
    select: { id: true, email: true, emailVerified: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (!user.emailVerified) {
    return NextResponse.json(
      { error: "Verify your email address before requesting a digest." },
      { status: 400 },
    );
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || req.nextUrl.origin;

  try {
    const result = await sendDigestForUser(user.id, origin, { force: true });
    if (!result.delivered) {
      if (result.reason === "send-failed") {
        return NextResponse.json(
          { error: "Could not send the digest right now. Please try again later." },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { error: "Could not generate a digest preview." },
        { status: 503 },
      );
    }

    return NextResponse.json({
      message: "Digest sent. Check your inbox in a few minutes.",
      sentTo: user.email,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send the digest." },
      { status: 502 },
    );
  }
}
