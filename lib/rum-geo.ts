import "server-only";
import type { NextRequest } from "next/server";

/**
 * Extract coarse geographic + device labels from an inbound request for RUM
 * segmentation. We deliberately stay at the country/region granularity — never
 * city + IP — so the resulting metrics carry no PII even if joined externally.
 *
 * Geo source priority:
 *   1. Vercel edge headers (`x-vercel-ip-country`, `x-vercel-ip-country-region`).
 *   2. Cloudflare (`cf-ipcountry`).
 *   3. Generic `x-country`.
 *   4. Default `unknown`.
 *
 * Device source priority:
 *   1. Explicit `device.kind` posted by the client (UA Client Hints).
 *   2. `Sec-CH-UA-Mobile`.
 *   3. UA fallback regex.
 *   4. Default `unknown`.
 */

export type RumGeo = {
  country: string;
  region: string;
};

export type RumDevice = {
  kind: "mobile" | "tablet" | "desktop" | "unknown";
};

const COUNTRY_RE = /^[A-Z]{2}$/;
const REGION_RE = /^[A-Z0-9-]{1,8}$/;

export function readRumGeo(req: NextRequest): RumGeo {
  const vercelCountry = req.headers.get("x-vercel-ip-country");
  const vercelRegion = req.headers.get("x-vercel-ip-country-region");
  if (vercelCountry && COUNTRY_RE.test(vercelCountry.toUpperCase())) {
    return {
      country: vercelCountry.toUpperCase(),
      region: vercelRegion && REGION_RE.test(vercelRegion.toUpperCase())
        ? vercelRegion.toUpperCase()
        : "unknown",
    };
  }
  const cf = req.headers.get("cf-ipcountry");
  if (cf && COUNTRY_RE.test(cf.toUpperCase())) {
    return { country: cf.toUpperCase(), region: "unknown" };
  }
  const generic = req.headers.get("x-country");
  if (generic && COUNTRY_RE.test(generic.toUpperCase())) {
    return { country: generic.toUpperCase(), region: "unknown" };
  }
  return { country: "unknown", region: "unknown" };
}

export function readRumDevice(
  req: NextRequest,
  clientDeviceKind: "mobile" | "tablet" | "desktop" | undefined,
): RumDevice {
  if (clientDeviceKind) return { kind: clientDeviceKind };

  // Client hint: `Sec-CH-UA-Mobile: ?1` is the spec for "is mobile".
  const chMobile = req.headers.get("sec-ch-ua-mobile");
  if (chMobile === "?1") return { kind: "mobile" };
  if (chMobile === "?0") return { kind: "desktop" };

  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  if (!ua) return { kind: "unknown" };
  if (/ipad|tablet|playbook|silk|(android(?!.*mobi))/.test(ua)) return { kind: "tablet" };
  if (/mobi|iphone|ipod|blackberry|iemobile|opera mini/.test(ua)) return { kind: "mobile" };
  return { kind: "desktop" };
}
