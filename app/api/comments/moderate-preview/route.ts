import { NextRequest, NextResponse } from "next/server";
import { parseRequestJson } from "@/lib/request-json";
import { moderationPreviewSchema } from "@/lib/schemas/api-bodies";
import { scanText } from "@/lib/safety-moderation";
import { getUser } from "@/lib/auth";
import { consumeRateLimit, SAFETY_PREVIEW_LIMIT } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const limit = await consumeRateLimit("safety:preview", user.userId, SAFETY_PREVIEW_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many preview requests — slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = await parseRequestJson(req, moderationPreviewSchema);
  if (!parsed.ok) return parsed.response;

  return NextResponse.json({
    moderation: scanText(parsed.data.text),
  });
}
