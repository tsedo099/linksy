import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { computeLevel } from "@/lib/services/xp.service";

// GET /api/user/xp — current user's XP + level info
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where:  { id: me.userId },
    select: { creatorMode: true, creatorXP: true, level: true, subscriptionTier: true },
  });
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const level        = user.level;
  const xpForCurrent = level * level * 100;
  const xpForNext    = (level + 1) * (level + 1) * 100;
  const progress     = user.creatorXP - xpForCurrent;
  const needed       = xpForNext - xpForCurrent;

  return NextResponse.json({
    creatorMode:      user.creatorMode,
    xp:               user.creatorXP,
    level,
    progress,
    needed,
    subscriptionTier: user.subscriptionTier,
    nextLevel:        computeLevel(user.creatorXP + 1),
  });
}
