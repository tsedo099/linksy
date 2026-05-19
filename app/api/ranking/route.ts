import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getWeeklyLeaderboard, getUserRank } from "@/lib/services/ranking.service";

// GET /api/ranking?limit=50
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const limit    = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 100);

  const [board, myRank] = await Promise.all([
    getWeeklyLeaderboard(undefined, limit),
    getUserRank(me.userId, undefined),
  ]);

  return NextResponse.json({ board, myRank });
}
