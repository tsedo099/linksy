import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getCreatorEligibility } from "@/lib/services/xp.service";

export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const data = await getCreatorEligibility(me.userId);
  return NextResponse.json(data);
}
