import "server-only";
import { NextRequest } from "next/server";
import { OAuthTokenType } from "@/lib/generated/prisma/client";
import { getUser } from "@/lib/auth";
import { hashToken, OAUTH_SCOPES, type OAuthScope } from "@/lib/oauth";
import { prisma } from "@/lib/prisma";

export type ApiActor =
  | {
      kind: "session";
      userId: string;
      username: string;
      email: string;
      scopes: OAuthScope[];
    }
  | {
      kind: "oauth";
      userId: string;
      username: string;
      email: string;
      clientId: string;
      applicationId: string;
      scopes: OAuthScope[];
      tokenId: string;
    };

function bearerToken(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

export async function resolveApiActor(req: NextRequest): Promise<ApiActor | null> {
  const bearer = bearerToken(req);
  if (bearer) {
    const token = await prisma.oAuthToken.findUnique({
      where: { tokenHash: hashToken(bearer) },
      include: { user: true, application: true },
    });
    if (
      !token ||
      token.type !== OAuthTokenType.ACCESS ||
      token.revokedAt ||
      token.expiresAt.getTime() <= Date.now() ||
      token.application.revokedAt ||
      token.user.accountDeletionRequestedAt
    ) {
      return null;
    }
    await prisma.oAuthToken.update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    });
    return {
      kind: "oauth",
      userId: token.userId,
      username: token.user.username,
      email: token.user.email,
      clientId: token.application.clientId,
      applicationId: token.applicationId,
      scopes: token.scopes as OAuthScope[],
      tokenId: token.id,
    };
  }

  const me = await getUser(req);
  if (!me) return null;
  return {
    kind: "session",
    userId: me.userId,
    username: me.username,
    email: me.email,
    scopes: [...OAUTH_SCOPES],
  };
}

export function hasScopes(actor: ApiActor, required: OAuthScope[]) {
  const available = new Set(actor.scopes);
  return required.every((scope) => available.has(scope));
}
