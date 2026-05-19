import { NextRequest, NextResponse } from "next/server";
import { OAuthTokenType } from "@/lib/generated/prisma/client";
import {
  OAUTH_ACCESS_TOKEN_TTL_MS,
  OAUTH_REFRESH_TOKEN_TTL_MS,
  clientSecretRequired,
  hashToken,
  randomToken,
  verifyHashedToken,
  verifyPkce,
} from "@/lib/oauth";
import { prisma } from "@/lib/prisma";
import { oauthTokenSchema } from "@/lib/schemas/api-bodies";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clientIpFromRequest } from "@/lib/client-ip";
import { writeAuditLog } from "@/lib/audit-log";

async function parseTokenBody(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    return Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
  }
  return req.json();
}

function tokenError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  const ipLimit = await consumeRateLimit(
    "oauth:token:ip",
    clientIpFromRequest(req),
    { windowMs: 60_000, max: 60 },
  );
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
    );
  }

  const parsed = oauthTokenSchema.safeParse(await parseTokenBody(req).catch(() => null));
  if (!parsed.success) return tokenError("invalid_request");

  const app = await prisma.oAuthApplication.findUnique({
    where: { clientId: parsed.data.client_id },
  });
  if (!app || app.revokedAt) return tokenError("invalid_client", 401);
  if (clientSecretRequired(app.clientType) && !verifyHashedToken(parsed.data.client_secret ?? "", app.clientSecretHash)) {
    return tokenError("invalid_client", 401);
  }

  if (parsed.data.grant_type === "authorization_code") {
    if (!parsed.data.code || !parsed.data.redirect_uri) return tokenError("invalid_request");

    const code = await prisma.oAuthAuthorizationCode.findUnique({
      where: { codeHash: hashToken(parsed.data.code) },
    });
    if (
      !code ||
      code.applicationId !== app.id ||
      code.usedAt ||
      code.expiresAt.getTime() <= Date.now() ||
      code.redirectUri !== parsed.data.redirect_uri ||
      !verifyPkce({
        method: code.codeChallengeMethod,
        challenge: code.codeChallenge,
        verifier: parsed.data.code_verifier,
      })
    ) {
      return tokenError("invalid_grant", 401);
    }

    const accessToken = randomToken("linksy_access");
    const refreshToken = randomToken("linksy_refresh");
    const accessExpiresAt = new Date(Date.now() + OAUTH_ACCESS_TOKEN_TTL_MS);
    const refreshExpiresAt = new Date(Date.now() + OAUTH_REFRESH_TOKEN_TTL_MS);

    await prisma.$transaction([
      prisma.oAuthAuthorizationCode.update({
        where: { id: code.id },
        data: { usedAt: new Date() },
      }),
      prisma.oAuthToken.create({
        data: {
          tokenHash: hashToken(accessToken),
          type: OAuthTokenType.ACCESS,
          applicationId: app.id,
          userId: code.userId,
          scopes: code.scopes,
          expiresAt: accessExpiresAt,
        },
      }),
      prisma.oAuthToken.create({
        data: {
          tokenHash: hashToken(refreshToken),
          refreshTokenHash: hashToken(refreshToken),
          type: OAuthTokenType.REFRESH,
          applicationId: app.id,
          userId: code.userId,
          scopes: code.scopes,
          expiresAt: refreshExpiresAt,
        },
      }),
    ]);

    await writeAuditLog({
      action: "OAUTH_TOKEN_ISSUED",
      actorUserId: code.userId,
      targetType: "OAUTH_APPLICATION",
      targetId: app.id,
      metadata: { grantType: "authorization_code", scopes: code.scopes },
      request: req,
    });

    return NextResponse.json({
      token_type: "Bearer",
      access_token: accessToken,
      expires_in: Math.floor(OAUTH_ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refreshToken,
      scope: code.scopes.join(" "),
    });
  }

  if (!parsed.data.refresh_token) return tokenError("invalid_request");
  const refresh = await prisma.oAuthToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.refresh_token) },
  });
  if (
    !refresh ||
    refresh.type !== OAuthTokenType.REFRESH ||
    refresh.applicationId !== app.id ||
    refresh.revokedAt ||
    refresh.expiresAt.getTime() <= Date.now()
  ) {
    return tokenError("invalid_grant", 401);
  }

  const nextAccessToken = randomToken("linksy_access");
  const nextRefreshToken = randomToken("linksy_refresh");
  const nextAccessExpiresAt = new Date(Date.now() + OAUTH_ACCESS_TOKEN_TTL_MS);
  const nextRefreshExpiresAt = new Date(Date.now() + OAUTH_REFRESH_TOKEN_TTL_MS);
  const nextRefreshRow = await prisma.oAuthToken.create({
    data: {
      tokenHash: hashToken(nextRefreshToken),
      refreshTokenHash: hashToken(nextRefreshToken),
      type: OAuthTokenType.REFRESH,
      applicationId: app.id,
      userId: refresh.userId,
      scopes: refresh.scopes,
      expiresAt: nextRefreshExpiresAt,
      parentRefreshTokenId: refresh.id,
    },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.oAuthToken.update({
      where: { id: refresh.id },
      data: { revokedAt: new Date(), replacedByTokenId: nextRefreshRow.id },
    }),
    prisma.oAuthToken.create({
      data: {
        tokenHash: hashToken(nextAccessToken),
        type: OAuthTokenType.ACCESS,
        applicationId: app.id,
        userId: refresh.userId,
        scopes: refresh.scopes,
        expiresAt: nextAccessExpiresAt,
      },
    }),
  ]);

  await writeAuditLog({
    action: "OAUTH_TOKEN_REFRESHED",
    actorUserId: refresh.userId,
    targetType: "OAUTH_APPLICATION",
    targetId: app.id,
    metadata: { scopes: refresh.scopes },
    request: req,
  });

  return NextResponse.json({
    token_type: "Bearer",
    access_token: nextAccessToken,
    expires_in: Math.floor(OAUTH_ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: nextRefreshToken,
    scope: refresh.scopes.join(" "),
  });
}
