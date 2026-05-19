import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { peekAiQuota, userTier } from "@/lib/ai-quota";

/**
 * GET /api/ai/quota — returns the caller's current AI quota state WITHOUT
 * consuming a slot. Used by the AI screen badge ("20/500 used today").
 * Cheap: one indexed lookup on (userId, day).
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tier = await userTier(me.userId);
  const quota = await peekAiQuota(me.userId, tier);
  return NextResponse.json({ quota });
}
