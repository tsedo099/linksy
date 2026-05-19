import "server-only";
import { createPrivateKey, createSign } from "node:crypto";
import http2, { type ClientHttp2Session } from "node:http2";
import { logger } from "@/lib/logger";
import type { PushChannel, PushDeliveryPayload, PushDeliveryResult, PushSubscriptionRow } from "@/lib/push/types";

const HOST_PROD = "https://api.push.apple.com";
const HOST_SANDBOX = "https://api.sandbox.push.apple.com";

// Apple recommends regenerating the JWT periodically; tokens older than ~60 minutes are rejected.
const PROVIDER_TOKEN_TTL_MS = 45 * 60 * 1000;

type ApnsConfig = {
  teamId: string;
  keyId: string;
  bundleId: string;
  privateKey: string;
  host: string;
};

let configCache: ApnsConfig | null | undefined;
let providerTokenCache: { token: string; createdAt: number } | null = null;
let sessionCache: ClientHttp2Session | null = null;
let sessionUrl: string | null = null;

function loadConfig(): ApnsConfig | null {
  if (configCache !== undefined) return configCache;

  const teamId = process.env.APNS_TEAM_ID?.trim();
  const keyId = process.env.APNS_KEY_ID?.trim();
  const bundleId = process.env.APNS_BUNDLE_ID?.trim();
  const privateKey = process.env.APNS_PRIVATE_KEY?.trim();
  const env = process.env.APNS_ENV?.trim().toLowerCase() === "sandbox" ? HOST_SANDBOX : HOST_PROD;

  if (!teamId || !keyId || !bundleId || !privateKey) {
    configCache = null;
    return null;
  }

  configCache = {
    teamId,
    keyId,
    bundleId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    host: env,
  };
  return configCache;
}

function base64Url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Convert the DER ECDSA signature returned by Node's signer into the raw r||s
 * concatenation that JOSE / APNs expect.
 */
function derToJose(signature: Buffer): Buffer {
  // DER: 0x30 len 0x02 rLen r 0x02 sLen s
  if (signature[0] !== 0x30) throw new Error("Invalid DER signature header");
  let offset = 2;
  const lenByte = signature[1] ?? 0;
  if (lenByte & 0x80) offset += lenByte & 0x7f;
  if (signature[offset] !== 0x02) throw new Error("Invalid DER (r marker)");
  const rLen = signature[offset + 1];
  if (rLen === undefined) throw new Error("Invalid DER (missing rLen)");
  const r = signature.subarray(offset + 2, offset + 2 + rLen);
  offset = offset + 2 + rLen;
  if (signature[offset] !== 0x02) throw new Error("Invalid DER (s marker)");
  const sLen = signature[offset + 1];
  if (sLen === undefined) throw new Error("Invalid DER (missing sLen)");
  const s = signature.subarray(offset + 2, offset + 2 + sLen);

  // Strip leading zeros, left-pad to 32 bytes (P-256 curve = 32-byte coordinates).
  const pad = (component: Buffer): Buffer => {
    let stripped = component;
    while (stripped.length > 32 && stripped[0] === 0x00) stripped = stripped.subarray(1);
    if (stripped.length === 32) return stripped;
    return Buffer.concat([Buffer.alloc(32 - stripped.length, 0), stripped]);
  };

  return Buffer.concat([pad(r), pad(s)]);
}

function signProviderToken(config: ApnsConfig): string {
  const header = { alg: "ES256", kid: config.keyId, typ: "JWT" };
  const claims = { iss: config.teamId, iat: Math.floor(Date.now() / 1000) };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;

  const key = createPrivateKey({ key: config.privateKey, format: "pem" });
  const signer = createSign("SHA256");
  signer.update(unsigned);
  signer.end();
  const der = signer.sign(key);
  const jose = derToJose(der);
  return `${unsigned}.${base64Url(jose)}`;
}

function getProviderToken(config: ApnsConfig): string {
  const now = Date.now();
  if (providerTokenCache && now - providerTokenCache.createdAt < PROVIDER_TOKEN_TTL_MS) {
    return providerTokenCache.token;
  }
  const token = signProviderToken(config);
  providerTokenCache = { token, createdAt: now };
  return token;
}

function getSession(host: string): ClientHttp2Session {
  if (sessionCache && !sessionCache.closed && !sessionCache.destroyed && sessionUrl === host) {
    return sessionCache;
  }
  if (sessionCache) {
    try {
      sessionCache.close();
    } catch {
      // ignore
    }
  }
  const next = http2.connect(host);
  next.on("error", (err) => {
    logger.warn({ scope: "push.apns.session", err: String(err) }, "APNs http2 session error");
  });
  sessionCache = next;
  sessionUrl = host;
  return next;
}

export function isApnsConfigured(): boolean {
  return loadConfig() !== null;
}

/** Readiness: sign provider JWT locally (validates ES256 key + team/key IDs; not a live APNs round-trip). */
export function probeApnsProviderJwt(): { ok: boolean; detail?: string } {
  const config = loadConfig();
  if (!config) return { ok: true, detail: "not_configured" };
  try {
    void signProviderToken(config);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg.slice(0, 400) };
  }
}

export const apnsChannel: PushChannel = {
  platform: "APNS",
  isConfigured: isApnsConfigured,
  async send(target: PushSubscriptionRow, payload: PushDeliveryPayload): Promise<PushDeliveryResult> {
    const config = loadConfig();
    if (!config) return { unregister: false };
    if (!target.deviceToken) return { unregister: true };

    const session = getSession(config.host);
    const providerToken = getProviderToken(config);

    const body = JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: payload.category.category === "alerting" ? "default" : undefined,
        "thread-id": payload.tag,
        "mutable-content": 1,
      },
      url: payload.url,
    });

    const headers: Record<string, string | number> = {
      ":method": "POST",
      ":path": `/3/device/${target.deviceToken}`,
      authorization: `bearer ${providerToken}`,
      "apns-topic": config.bundleId,
      "apns-push-type": payload.category.apnsPushType,
      "apns-priority": payload.category.apnsPriority,
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    };

    return await new Promise<PushDeliveryResult>((resolve) => {
      let resolved = false;
      const settle = (result: PushDeliveryResult) => {
        if (resolved) return;
        resolved = true;
        resolve(result);
      };

      const req = session.request(headers);
      let status = 0;
      let resBody = "";

      req.on("response", (resHeaders) => {
        status = Number(resHeaders[":status"] ?? 0);
      });
      req.setEncoding("utf8");
      req.on("data", (chunk: string) => {
        resBody += chunk;
      });
      req.on("end", () => {
        if (status >= 200 && status < 300) {
          settle({ unregister: false });
          return;
        }
        // 410 Gone → token no longer active (uninstalled); 400 BadDeviceToken → drop too.
        let reason = "";
        try {
          reason = (JSON.parse(resBody) as { reason?: string }).reason ?? "";
        } catch {
          // ignore
        }
        if (status === 403 && reason === "ExpiredProviderToken") {
          providerTokenCache = null;
        }
        logger.warn(
          { scope: "push.apns", userId: target.userId, status, reason },
          "APNs delivery rejected",
        );
        const unregister = status === 410 || reason === "BadDeviceToken" || reason === "Unregistered";
        settle({ unregister });
      });
      req.on("error", (err) => {
        logger.warn(
          { scope: "push.apns", userId: target.userId, err: String(err) },
          "APNs request failed",
        );
        settle({ unregister: false });
      });

      req.end(body);
    });
  },
};
