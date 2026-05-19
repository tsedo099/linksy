import "server-only";
import { createPrivateKey, createSign } from "node:crypto";
import { logger } from "@/lib/logger";
import type { PushChannel, PushDeliveryPayload, PushDeliveryResult, PushSubscriptionRow } from "@/lib/push/types";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_LIFETIME_SECONDS = 3600;
const TOKEN_REFRESH_BEFORE_SECONDS = 60;

type ServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

type CachedAccessToken = { token: string; expiresAt: number };

let serviceAccountCache: ServiceAccount | null | undefined;
let accessTokenCache: CachedAccessToken | null = null;
let inFlightTokenFetch: Promise<CachedAccessToken> | null = null;

function loadServiceAccount(): ServiceAccount | null {
  if (serviceAccountCache !== undefined) return serviceAccountCache;

  const inlineJson = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    try {
      const parsed = JSON.parse(inlineJson) as Partial<{
        project_id: string;
        client_email: string;
        private_key: string;
      }>;
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        serviceAccountCache = {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, "\n"),
        };
        return serviceAccountCache;
      }
    } catch (err) {
      logger.warn({ scope: "push.fcm", err: String(err) }, "FCM_SERVICE_ACCOUNT_JSON parse failed");
    }
  }

  const projectId = process.env.FCM_PROJECT_ID?.trim();
  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FCM_PRIVATE_KEY?.trim();
  if (projectId && clientEmail && privateKey) {
    serviceAccountCache = {
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    };
    return serviceAccountCache;
  }

  serviceAccountCache = null;
  return null;
}

function base64Url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signJwt(account: ServiceAccount): string {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: account.clientEmail,
    scope: FCM_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + TOKEN_LIFETIME_SECONDS,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;

  const key = createPrivateKey({ key: account.privateKey, format: "pem" });
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(key);
  return `${unsigned}.${base64Url(signature)}`;
}

async function fetchAccessToken(account: ServiceAccount): Promise<CachedAccessToken> {
  const assertion = signJwt(account);
  const params = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OAuth token exchange failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("OAuth response missing access_token");
  const expiresInSec = typeof data.expires_in === "number" ? data.expires_in : TOKEN_LIFETIME_SECONDS;
  return {
    token: data.access_token,
    expiresAt: Date.now() + (expiresInSec - TOKEN_REFRESH_BEFORE_SECONDS) * 1000,
  };
}

async function getAccessToken(account: ServiceAccount): Promise<string> {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) return accessTokenCache.token;
  if (inFlightTokenFetch) return (await inFlightTokenFetch).token;

  inFlightTokenFetch = fetchAccessToken(account)
    .then((entry) => {
      accessTokenCache = entry;
      return entry;
    })
    .finally(() => {
      inFlightTokenFetch = null;
    });
  return (await inFlightTokenFetch).token;
}

export function isFcmConfigured(): boolean {
  return loadServiceAccount() !== null;
}

/** Readiness: exchange OAuth token with Google (validates service account + private key TTL path). */
export async function probeFcmOAuth(): Promise<{ ok: boolean; detail?: string }> {
  const account = loadServiceAccount();
  if (!account) return { ok: true, detail: "not_configured" };
  try {
    await fetchAccessToken(account);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg.slice(0, 400) };
  }
}

function buildMessage(deviceToken: string, payload: PushDeliveryPayload) {
  return {
    message: {
      token: deviceToken,
      notification: { title: payload.title, body: payload.body },
      android: {
        priority: payload.category.fcmAndroidPriority,
        notification: {
          tag: payload.tag,
          channel_id: payload.category.category === "alerting" ? "alerting" : "silent",
          default_sound: payload.category.category === "alerting",
        },
      },
      apns: {
        headers: {
          "apns-priority": String(payload.category.apnsPriority),
          "apns-push-type": payload.category.apnsPushType,
        },
        payload: {
          aps: {
            sound: payload.category.category === "alerting" ? "default" : undefined,
            "thread-id": payload.tag,
          },
        },
      },
      data: payload.url ? { url: payload.url } : undefined,
    },
  };
}

export const fcmChannel: PushChannel = {
  platform: "FCM",
  isConfigured: isFcmConfigured,
  async send(target: PushSubscriptionRow, payload: PushDeliveryPayload): Promise<PushDeliveryResult> {
    const account = loadServiceAccount();
    if (!account) return { unregister: false };
    if (!target.deviceToken) return { unregister: true };

    let token: string;
    try {
      token = await getAccessToken(account);
    } catch (err) {
      logger.warn({ scope: "push.fcm.oauth", err: String(err) }, "FCM OAuth token fetch failed");
      return { unregister: false };
    }

    const url = `https://fcm.googleapis.com/v1/projects/${account.projectId}/messages:send`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildMessage(target.deviceToken, payload)),
      });
    } catch (err) {
      logger.warn({ scope: "push.fcm", userId: target.userId, err: String(err) }, "FCM send failed");
      return { unregister: false };
    }

    if (res.ok) return { unregister: false };

    // Token has been invalidated by the OS / app uninstalled — drop it.
    // https://firebase.google.com/docs/cloud-messaging/manage-tokens
    if (res.status === 404 || res.status === 401) {
      // 401 may mean stale OAuth — invalidate cache so next send re-signs.
      if (res.status === 401) accessTokenCache = null;
    }
    if (res.status === 404) return { unregister: true };

    const errBody = await res.text().catch(() => "");
    const errorCode = (() => {
      try {
        return (JSON.parse(errBody) as { error?: { details?: { errorCode?: string }[] } })
          .error?.details?.find((d) => d.errorCode)?.errorCode;
      } catch {
        return undefined;
      }
    })();

    logger.warn(
      { scope: "push.fcm", userId: target.userId, status: res.status, errorCode, body: errBody.slice(0, 200) },
      "FCM delivery rejected",
    );

    return { unregister: errorCode === "UNREGISTERED" || errorCode === "INVALID_ARGUMENT" };
  },
};
