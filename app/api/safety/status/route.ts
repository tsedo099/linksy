import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getSafetyStatus } from "@/lib/safety-warnings";
import { consumeRateLimit, SAFETY_STATUS_LIMIT } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const limit = await consumeRateLimit("safety:status", user.userId, SAFETY_STATUS_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const status = await getSafetyStatus(user.userId);
    return NextResponse.json({ status });
  } catch (err) {
    logger.error({ scope: "safety.status", userId: user.userId, err }, "failed to load safety status");
    return NextResponse.json({ error: "Failed to load status." }, { status: 500 });
  }
}
