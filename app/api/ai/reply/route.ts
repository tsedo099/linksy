import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { generateOnce } from "@/lib/gemini";
import { consumeAiQuota, userTier } from "@/lib/ai-quota";

/**
 * POST /api/ai/reply
 * Body: `{ message: string, context?: string, tone?: string }`
 * Returns: `{ suggestions: string[] }` (3 short replies)
 */
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { message?: string; context?: string; tone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = (body.message ?? "").trim().slice(0, 4000);
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const context = (body.context ?? "").trim().slice(0, 2000);
  const tone = (body.tone ?? "").trim().slice(0, 80) || "warm and concise";

  const prompt = [
    context ? `Conversation context: ${context}` : "",
    `Incoming message: "${message}"`,
    ``,
    `Draft 3 short reply options (each under 200 chars).`,
    `Tone: ${tone}. No emoji unless the incoming message uses them.`,
    `Return only a numbered list (1., 2., 3.) — no commentary.`,
  ].filter(Boolean).join("\n");

  const quota = await consumeAiQuota(me.userId, await userTier(me.userId));
  if (!quota.allowed) {
    return NextResponse.json(
      { error: "Daily AI quota exceeded. Upgrade to Pro for 25× more requests.", quota },
      { status: 429 },
    );
  }

  try {
    const text = await generateOnce({ prompt });
    const suggestions = text
      .split(/\n+/)
      .map((line) => line.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
    return NextResponse.json({ suggestions, quota });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "AI error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
