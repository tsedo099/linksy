import { NextRequest, NextResponse } from "next/server";
import { OAuthClientType } from "@/lib/generated/prisma/client";
import { getUser } from "@/lib/auth";
import { randomToken, hashToken, normalizeScopes } from "@/lib/oauth";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { oauthApplicationUpdateSchema } from "@/lib/schemas/api-bodies";
import { writeAuditLog } from "@/lib/audit-log";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;

  const parsed = await parseRequestJson(req, oauthApplicationUpdateSchema);
  if (!parsed.ok) return parsed.response;

  const existing = await prisma.oAuthApplication.findFirst({
    where: { id, ownerId: me.userId },
    select: { id: true, clientType: true },
  });
  if (!existing) return NextResponse.json({ error: "Application not found." }, { status: 404 });

  const clientType = parsed.data.clientType
    ? parsed.data.clientType === "PUBLIC"
      ? OAuthClientType.PUBLIC
      : OAuthClientType.CONFIDENTIAL
    : undefined;
  const clientSecret = clientType === OAuthClientType.CONFIDENTIAL ? randomToken("linksy_secret") : null;

  const updated = await prisma.oAuthApplication.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description?.trim() || undefined,
      homepageUrl: parsed.data.homepageUrl?.trim() || undefined,
      redirectUris: parsed.data.redirectUris,
      scopes: parsed.data.scopes ? normalizeScopes(parsed.data.scopes) : undefined,
      clientType,
      clientSecretHash: clientType === OAuthClientType.PUBLIC
        ? null
        : clientSecret
          ? hashToken(clientSecret)
          : undefined,
      revokedAt: parsed.data.revoked === true
        ? new Date()
        : parsed.data.revoked === false
          ? null
          : undefined,
    },
    select: { id: true, clientId: true },
  });

  await writeAuditLog({
    action: "OAUTH_APP_UPDATED",
    actorUserId: me.userId,
    targetType: "OAUTH_APPLICATION",
    targetId: id,
    request: req,
  });

  return NextResponse.json({ application: updated, clientSecret });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await params;

  const updated = await prisma.oAuthApplication.updateMany({
    where: { id, ownerId: me.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (updated.count === 0) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  await prisma.oAuthToken.updateMany({
    where: { applicationId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    action: "OAUTH_APP_REVOKED",
    actorUserId: me.userId,
    targetType: "OAUTH_APPLICATION",
    targetId: id,
    request: req,
  });

  return NextResponse.json({ message: "Application revoked." });
}
