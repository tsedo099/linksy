import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { canEnableCreatorMode } from "@/lib/services/xp.service";

// POST /api/creator/toggle — enable/disable creator mode
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where:  { id: me.userId },
    select: { creatorMode: true },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (!user.creatorMode) {
    const eligible = await canEnableCreatorMode(me.userId);
    if (!eligible) {
      return NextResponse.json(
        { error: "You need 2 posts or 10 interactions to enable Creator Mode." },
        { status: 403 },
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: me.userId },
    data:  { creatorMode: !user.creatorMode },
    select: { creatorMode: true, creatorXP: true, level: true },
  });

  return NextResponse.json({ creatorMode: updated.creatorMode, xp: updated.creatorXP, level: updated.level });
}
