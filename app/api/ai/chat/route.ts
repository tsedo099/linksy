import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { generateAgentTurn, type ChatTurn } from "@/lib/gemini";
import { consumeAiQuota, userTier } from "@/lib/ai-quota";

/**
 * POST /api/ai/chat
 * Body: `{ history: ChatTurn[] }`
 * Returns: `{ text: string, actions: AgentAction[] }`
 *
 * Single-turn agent call: Gemini may respond with text, a list of UI
 * actions for the client to execute (e.g. `navigate`, `set_post_caption`,
 * `open_image_picker`), or both. Non-streaming so the action list arrives
 * as one atomic response — the client can sequence the actions deterministically.
 */
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { history?: ChatTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const history = Array.isArray(body.history) ? body.history : [];
  if (history.length === 0) {
    return NextResponse.json({ error: "history is required" }, { status: 400 });
  }
  if (history.length > 40) {
    return NextResponse.json({ error: "history too long (max 40 turns)" }, { status: 400 });
  }
  for (const turn of history) {
    if (turn.role !== "user" && turn.role !== "model") {
      return NextResponse.json({ error: "invalid turn role" }, { status: 400 });
    }
    if (typeof turn.text !== "string" || turn.text.length > 8000) {
      return NextResponse.json({ error: "invalid turn text" }, { status: 400 });
    }
  }

  const quota = await consumeAiQuota(me.userId, await userTier(me.userId));
  if (!quota.allowed) {
    return NextResponse.json(
      { error: "Daily AI quota exceeded. Upgrade to Pro for 25× more requests.", quota },
      { status: 429 },
    );
  }

  try {
    const result = await generateAgentTurn({ history });
    return NextResponse.json({ ...result, quota });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
