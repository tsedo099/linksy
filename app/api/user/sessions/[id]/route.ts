import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { revokeSessionForUser } from "@/lib/refresh-session";

// DELETE /api/user/sessions/[id] - revoke one of this user's sessions
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    select: { id: true, userId: true, revokedAt: true },
  });

  if (!session || session.userId !== me.userId) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  if (session.revokedAt === null) {
    await revokeSessionForUser(id, me.userId);
  }

  const isCurrent = me.sessionId === id;

  const response = NextResponse.json({
    message: "Session revoked.",
    current: isCurrent,
  });

  if (isCurrent) {
    clearAuthCookies(response);
  }

  return response;
}
