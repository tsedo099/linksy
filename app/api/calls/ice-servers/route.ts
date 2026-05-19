import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";

export const runtime = "nodejs";

type IceServer = { urls: string | string[]; username?: string; credential?: string };

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour — typical for ephemeral TURN

/** Multiple public STUN endpoints improve discovery across NATs (production-friendly default). */
const DEFAULT_STUN_URLS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
];

/**
 * Mint short-lived TURN credentials from Cloudflare's Realtime TURN API.
 * Returns the iceServer bundle (URLs + username + credential) or null on
 * any failure — the caller falls back to STUN-only so calls can at least
 * try direct P2P.
 */
async function fetchCloudflareTurnCredentials(
  tokenId: string,
  apiToken: string,
  ttlSeconds: number,
): Promise<IceServer | null> {
  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(tokenId)}/credentials/generate`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: ttlSeconds }),
        // Cloudflare's endpoint is generally fast (<200ms); cap so a hung
        // call doesn't block our own /ice-servers endpoint indefinitely.
        signal: AbortSignal.timeout(3500),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | { iceServers?: { urls?: string | string[]; username?: string; credential?: string } }
      | null;
    const cf = data?.iceServers;
    if (!cf?.urls || !cf.username || !cf.credential) return null;
    return { urls: cf.urls, username: cf.username, credential: cf.credential };
  } catch {
    return null;
  }
}

/**
 * GET /api/calls/ice-servers — RTC ICE server config for the WebRTC client.
 *
 * STUN: defaults to several Google public STUN hosts; override with `STUN_URL` (single URL).
 * TURN: gated on env. Three modes (checked in this order):
 *   1. Cloudflare Realtime TURN: `CLOUDFLARE_TURN_TOKEN_ID` +
 *      `CLOUDFLARE_TURN_API_TOKEN` — server hits Cloudflare's API per
 *      request and forwards the returned ephemeral bundle to the client.
 *   2. coturn REST (HMAC): `TURN_URL` + `TURN_STATIC_AUTH_SECRET` —
 *      server signs `<expiry>:<userId>` with HMAC-SHA1, matching coturn's
 *      `--use-auth-secret` mode (rotation without provisioning users).
 *   3. Static creds: `TURN_URL` + `TURN_USERNAME` + `TURN_PASSWORD`.
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const stunOverride = process.env.STUN_URL?.trim();
  const cfTokenId = process.env.CLOUDFLARE_TURN_TOKEN_ID?.trim();
  const cfApiToken = process.env.CLOUDFLARE_TURN_API_TOKEN?.trim();
  const turnUrl = process.env.TURN_URL?.trim();
  const turnSecret = process.env.TURN_STATIC_AUTH_SECRET?.trim();
  const turnStaticUser = process.env.TURN_USERNAME?.trim();
  const turnStaticPass = process.env.TURN_PASSWORD?.trim();

  const ttlSeconds = Math.max(60, Number(process.env.TURN_CREDENTIAL_TTL_SECONDS ?? DEFAULT_TTL_SECONDS));
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

  const iceServers: IceServer[] = stunOverride
    ? [{ urls: stunOverride }]
    : DEFAULT_STUN_URLS.map((urls) => ({ urls }));

  let usedEphemeral = false;
  if (cfTokenId && cfApiToken) {
    const cfBundle = await fetchCloudflareTurnCredentials(cfTokenId, cfApiToken, ttlSeconds);
    if (cfBundle) {
      iceServers.push(cfBundle);
      usedEphemeral = true;
    }
  } else if (turnUrl && turnSecret) {
    const username = `${expiresAt}:${me.userId}`;
    const credential = createHmac("sha1", turnSecret).update(username).digest("base64");
    iceServers.push({ urls: turnUrl, username, credential });
    usedEphemeral = true;
  } else if (turnUrl && turnStaticUser && turnStaticPass) {
    iceServers.push({ urls: turnUrl, username: turnStaticUser, credential: turnStaticPass });
  }

  return NextResponse.json({
    iceServers,
    /** ISO timestamp the TURN credentials become invalid (null when static / no TURN). */
    expiresAt: usedEphemeral ? new Date(expiresAt * 1000).toISOString() : null,
  });
}
