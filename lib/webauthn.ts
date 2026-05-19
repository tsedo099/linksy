import "server-only";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";

const DEFAULT_RP_NAME = "Linksy";

export function webAuthnRpName() {
  return process.env.WEBAUTHN_RP_NAME?.trim() || DEFAULT_RP_NAME;
}

export function webAuthnRpId() {
  const fromEnv = process.env.WEBAUTHN_RP_ID?.trim();
  if (fromEnv) return fromEnv;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      return new URL(appUrl).hostname;
    } catch {
      // Fall through to local dev default.
    }
  }
  return "localhost";
}

export function webAuthnOrigins(requestOrigin: string) {
  const configured = process.env.WEBAUTHN_ORIGINS?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (configured?.length) return configured;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return appUrl ? [appUrl, requestOrigin] : [requestOrigin];
}

export function userIdToWebAuthnUserId(userId: string) {
  return new TextEncoder().encode(userId);
}

export function toCredentialDescriptor(credential: {
  credentialId: string;
  transports: string[];
}) {
  return {
    id: credential.credentialId,
    transports: credential.transports as AuthenticatorTransportFuture[],
  };
}

export function normalizeCredentialName(name: unknown) {
  const text = typeof name === "string" ? name.trim() : "";
  return text ? text.slice(0, 80) : null;
}
