import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { passkeyUpdateSchema } from "@/lib/schemas/api-bodies";
import { normalizeCredentialName } from "@/lib/webauthn";
import { writeAuditLog } from "@/lib/audit-log";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, passkeyUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { id } = await params;

  const updated = await prisma.webAuthnCredential.updateMany({
    where: { id, userId: me.userId, revokedAt: null },
    data: { name: normalizeCredentialName(parsed.data.name) },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Passkey not found." }, { status: 404 });
  }

  return NextResponse.json({ message: "Passkey updated." });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;

  const updated = await prisma.webAuthnCredential.updateMany({
    where: { id, userId: me.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Passkey not found." }, { status: 404 });
  }

  await writeAuditLog({
    action: "PASSKEY_REVOKED",
    actorUserId: me.userId,
    targetType: "WEBAUTHN_CREDENTIAL",
    targetId: id,
    request: req,
  });

  return NextResponse.json({ message: "Passkey removed." });
}
