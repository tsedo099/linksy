import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit-log";
import { parseRequestJson } from "@/lib/request-json";
import { changePasswordBodySchema } from "@/lib/schemas/api-bodies";
import { pwnedPasswordIssue } from "@/lib/password-policy";

export async function POST(req: NextRequest) {
  const me = await getUser(req);

  if (!me) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const parsed = await parseRequestJson(req, changePasswordBodySchema);
  if (!parsed.ok) return parsed.response;
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: me.userId },
    select: { id: true, passwordHash: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (user.passwordHash) {
    if (!currentPassword?.length) {
      return NextResponse.json({ error: "Current password is required." }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      await writeAuditLog({
        action: "PASSWORD_CHANGE_FAILED",
        actorUserId: user.id,
        targetType: "USER",
        targetId: user.id,
        metadata: { reason: "INVALID_CURRENT_PASSWORD" },
        request: req,
      });
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
  }

  const pwnedIssue = await pwnedPasswordIssue(newPassword);
  if (pwnedIssue) {
    return NextResponse.json({ error: pwnedIssue }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });
  await writeAuditLog({
    action: "PASSWORD_CHANGED",
    actorUserId: user.id,
    targetType: "USER",
    targetId: user.id,
    request: req,
  });

  return NextResponse.json({ message: "Password updated." });
}
