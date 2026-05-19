import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { Prisma } from "@/lib/generated/prisma/client";
import { writeAuditLog } from "@/lib/audit-log";

function isMissingDeactivatedColumn(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return String(error.meta?.column ?? error.message ?? "").includes("deactivatedAt");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("deactivatedAt");
}

// POST /api/user/deactivate - soft-disable account, revoke all sessions, clear cookie
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    await prisma.user.update({
      where: { id: me.userId },
      data: { deactivatedAt: new Date() },
    });
  } catch (error) {
    if (isMissingDeactivatedColumn(error)) {
      return NextResponse.json(
        { error: "Account deactivation is temporarily unavailable. Please retry once the database migration is applied." },
        { status: 503 },
      );
    }
    throw error;
  }

  await prisma.session
    .updateMany({
      where: { userId: me.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    .catch(() => { /* sessions table may not exist on legacy DB */ });

  await prisma.refreshToken.updateMany({
    where: {
      session: { userId: me.userId },
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  await writeAuditLog({
    action: "ACCOUNT_DEACTIVATED",
    actorUserId: me.userId,
    targetType: "USER",
    targetId: me.userId,
    request: req,
  }).catch(() => { /* ignore audit failures */ });

  const response = NextResponse.json({
    deactivated: true,
    message: "Account deactivated. Sign in again any time to reactivate.",
  });
  clearAuthCookies(response);
  return response;
}
