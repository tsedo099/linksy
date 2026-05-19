import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { generateOnce } from "@/lib/gemini";
import { consumeAiQuota, userTier } from "@/lib/ai-quota";

/**
 * POST /api/ai/caption
 * Body: `{ topic: string, tone?: string, hashtags?: boolean }`
 * Returns: `{ captions: string[] }` (3 variants)
 */
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { topic?: string; tone?: string; hashtags?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const topic = (body.topic ?? "").trim().slice(0, 2000);
  if (!topic) return NextResponse.json({ error: "topic is required" }, { status: 400 });

  const tone = (body.tone ?? "").trim().slice(0, 80) || "warm and authentic";
  const wantHashtags = body.hashtags !== false;

  const prompt = [
    `Write 3 short Instagram-style post captions for this topic:`,
    `"${topic}"`,
    ``,
    `Tone: ${tone}.`,
    `Each caption max 220 chars.`,
    wantHashtags ? `End each with 2-4 relevant hashtags.` : `No hashtags.`,
    `Return as a numbered list (1., 2., 3.) — no extra commentary.`,
  ].join("\n");

  const quota = await consumeAiQuota(me.userId, await userTier(me.userId));
  if (!quota.allowed) {
    return NextResponse.json(
      { error: "Daily AI quota exceeded. Upgrade to Pro for 25× more requests.", quota },
      { status: 429 },
    );
  }

  try {
    const text = await generateOnce({ prompt });
    const captions = text
      .split(/\n+/)
      .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
    return NextResponse.json({ captions, quota });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
