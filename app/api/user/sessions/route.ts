import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";

// GET /api/user/sessions - list this user's active login sessions
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const currentSessionId = me.sessionId ?? null;

  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: {
      userId: me.userId,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { lastActiveAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      lastActiveAt: true,
      expiresAt: true,
    },
  });

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      ...s,
      current: s.id === currentSessionId,
    })),
  });
}
