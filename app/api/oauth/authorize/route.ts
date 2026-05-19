import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import {
  exactRedirectAllowed,
  hashToken,
  normalizeScopes,
  randomToken,
  OAUTH_AUTH_CODE_TTL_MS,
} from "@/lib/oauth";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { oauthAuthorizeSchema, oauthConsentSchema } from "@/lib/schemas/api-bodies";
import { writeAuditLog } from "@/lib/audit-log";

function deniedRedirect(redirectUri: string, state: string | undefined, error: string) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const query = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = oauthAuthorizeSchema.safeParse(query);
  if (!parsed.success) return NextResponse.json({ error: "Invalid OAuth request." }, { status: 400 });

  const app = await prisma.oAuthApplication.findUnique({
    where: { clientId: parsed.data.client_id },
    select: {
      id: true,
      name: true,
      description: true,
      homepageUrl: true,
      redirectUris: true,
      scopes: true,
      revokedAt: true,
    },
  });
  if (!app || app.revokedAt || !exactRedirectAllowed(parsed.data.redirect_uri, app.redirectUris)) {
    return NextResponse.json({ error: "Invalid OAuth client." }, { status: 400 });
  }

  const scopes = normalizeScopes(parsed.data.scope, app.scopes);
  if (scopes.length === 0) return NextResponse.json({ error: "No valid scopes requested." }, { status: 400 });

  return NextResponse.json({
    application: {
      name: app.name,
      description: app.description,
      homepageUrl: app.homepageUrl,
    },
    scopes,
    request: parsed.data,
  });
}

export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, oauthConsentSchema);
  if (!parsed.ok) return parsed.response;

  const app = await prisma.oAuthApplication.findUnique({
    where: { clientId: parsed.data.client_id },
    select: { id: true, redirectUris: true, scopes: true, revokedAt: true },
  });
  if (!app || app.revokedAt || !exactRedirectAllowed(parsed.data.redirect_uri, app.redirectUris)) {
    return NextResponse.json({ error: "Invalid OAuth client." }, { status: 400 });
  }

  const scopes = normalizeScopes(parsed.data.scope, app.scopes);
  if (parsed.data.action === "deny") {
    return NextResponse.json({
      redirectTo: deniedRedirect(parsed.data.redirect_uri, parsed.data.state, "access_denied"),
    });
  }

  const codeRaw = randomToken("linksy_code");
  await prisma.$transaction([
    prisma.oAuthConsent.upsert({
      where: { userId_applicationId: { userId: me.userId, applicationId: app.id } },
      update: { scopes, revokedAt: null },
      create: { userId: me.userId, applicationId: app.id, scopes },
    }),
    prisma.oAuthAuthorizationCode.create({
      data: {
        codeHash: hashToken(codeRaw),
        applicationId: app.id,
        userId: me.userId,
        redirectUri: parsed.data.redirect_uri,
        scopes,
        codeChallenge: parsed.data.code_challenge ?? null,
        codeChallengeMethod: parsed.data.code_challenge_method ?? null,
        expiresAt: new Date(Date.now() + OAUTH_AUTH_CODE_TTL_MS),
      },
    }),
  ]);

  await writeAuditLog({
    action: "OAUTH_CONSENT_APPROVED",
    actorUserId: me.userId,
    targetType: "OAUTH_APPLICATION",
    targetId: app.id,
    metadata: { scopes },
    request: req,
  });

  const redirect = new URL(parsed.data.redirect_uri);
  redirect.searchParams.set("code", codeRaw);
  if (parsed.data.state) redirect.searchParams.set("state", parsed.data.state);
  return NextResponse.json({ redirectTo: redirect.toString() });
}
