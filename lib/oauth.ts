import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuthClientType } from "@/lib/generated/prisma/client";

export const OAUTH_SCOPES = [
  "profile:read",
  "posts:read",
  "posts:write",
  "media:upload",
  "notifications:read",
] as const;

export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export const OAUTH_SCOPE_LABELS: Record<OAuthScope, string> = {
  "profile:read": "Read basic profile information",
  "posts:read": "Read visible posts",
  "posts:write": "Create and update posts",
  "media:upload": "Upload media",
  "notifications:read": "Read notifications",
};

export const OAUTH_ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
export const OAUTH_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const OAUTH_AUTH_CODE_TTL_MS = 5 * 60 * 1000;

export function randomToken(prefix: string) {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

export function hashToken(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function verifyHashedToken(raw: string, hash: string | null | undefined) {
  if (!hash) return false;
  const a = Buffer.from(hashToken(raw), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeScopes(input: string[] | string | undefined, allowed: readonly string[] = OAUTH_SCOPES) {
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(/\s+/)
      : [];
  const allowedSet = new Set<string>(allowed);
  return [...new Set(values.map((scope) => scope.trim()).filter((scope) => allowedSet.has(scope)))] as OAuthScope[];
}

export function exactRedirectAllowed(redirectUri: string, allowed: string[]) {
  return allowed.includes(redirectUri);
}

export function verifyPkce(args: {
  method: string | null | undefined;
  challenge: string | null | undefined;
  verifier: string | null | undefined;
}) {
  if (!args.challenge) return true;
  if (!args.verifier) return false;
  if ((args.method ?? "plain") === "plain") return args.challenge === args.verifier;
  const digest = createHash("sha256").update(args.verifier, "utf8").digest("base64url");
  return digest === args.challenge;
}

export function clientSecretRequired(clientType: OAuthClientType) {
  return clientType === "CONFIDENTIAL";
}
