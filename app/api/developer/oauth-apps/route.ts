import { NextRequest, NextResponse } from "next/server";
import { OAuthClientType } from "@/lib/generated/prisma/client";
import { getUser } from "@/lib/auth";
import { randomToken, hashToken, normalizeScopes } from "@/lib/oauth";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { oauthApplicationCreateSchema } from "@/lib/schemas/api-bodies";
import { writeAuditLog } from "@/lib/audit-log";

export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const applications = await prisma.oAuthApplication.findMany({
    where: { ownerId: me.userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      clientId: true,
      clientType: true,
      name: true,
      description: true,
      homepageUrl: true,
      redirectUris: true,
      scopes: true,
      createdAt: true,
      revokedAt: true,
    },
  });

  return NextResponse.json({ applications });
}

export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, oauthApplicationCreateSchema);
  if (!parsed.ok) return parsed.response;

  const clientType = parsed.data.clientType === "PUBLIC"
    ? OAuthClientType.PUBLIC
    : OAuthClientType.CONFIDENTIAL;
  const clientSecret = clientType === OAuthClientType.CONFIDENTIAL ? randomToken("linksy_secret") : null;
  const clientId = randomToken("linksy_client");

  const app = await prisma.oAuthApplication.create({
    data: {
      ownerId: me.userId,
      clientId,
      clientSecretHash: clientSecret ? hashToken(clientSecret) : null,
      clientType,
      name: parsed.data.name,
      description: parsed.data.description?.trim() || null,
      homepageUrl: parsed.data.homepageUrl?.trim() || null,
      redirectUris: parsed.data.redirectUris,
      scopes: normalizeScopes(parsed.data.scopes),
    },
    select: { id: true, clientId: true },
  });

  await writeAuditLog({
    action: "OAUTH_APP_CREATED",
    actorUserId: me.userId,
    targetType: "OAUTH_APPLICATION",
    targetId: app.id,
    request: req,
  });

  return NextResponse.json({
    application: app,
    clientSecret,
  }, { status: 201 });
}
