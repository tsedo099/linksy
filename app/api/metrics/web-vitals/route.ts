import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { clientIpFromRequest } from "@/lib/client-ip";
import { logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { parseRequestJson } from "@/lib/request-json";
import { webVitalSchema } from "@/lib/schemas/api-bodies";
import { readRumDevice, readRumGeo } from "@/lib/rum-geo";
import { rumWebVitalHistogram, rumWebVitalRatingTotal } from "@/lib/metrics";

export const runtime = "nodejs";

const RUM_RATE_LIMIT = { windowMs: 60_000, max: 60 } as const;

/**
 * Receives Core Web Vitals (LCP, INP, CLS, FCP, TTFB, FID) emitted by the
 * `web-vitals` package on the client. Each sample is:
 *   - logged via pino so any log shipper (Loki, Datadog, BetterStack, …) can
 *     aggregate / segment by geo + device,
 *   - recorded onto Prometheus histograms + rating counter, segmented by
 *     `metric × rating × device × country` (low-cardinality labels only —
 *     no city, no region beyond the top-level admin division — to stay
 *     PII-safe even when joined externally),
 *   - forwarded to Sentry as a warning when the sample is `poor`, so we
 *     never miss a regression even if Prometheus retention rolls over.
 */
export async function POST(req: NextRequest) {
  const ip = clientIpFromRequest(req);
  const limit = await consumeRateLimit("rum:web-vitals", ip, RUM_RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many reports." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = await parseRequestJson(req, webVitalSchema);
  if (!parsed.ok) return parsed.response;

  const { name, value, rating, id, navigationType, path, device: clientDevice } = parsed.data;
  const geo = readRumGeo(req);
  const device = readRumDevice(req, clientDevice?.kind);

  // CLS is unitless ([0..N], typically [0..1]); scale to ms-equivalent so it
  // fits the shared bucket schema with LCP/INP/TTFB.
  const sampleForHistogram = name === "CLS" ? value * 1000 : value;
  const labels = {
    metric: name,
    rating,
    device: device.kind,
    country: geo.country,
  };
  rumWebVitalHistogram.observe(labels, sampleForHistogram);
  rumWebVitalRatingTotal.inc(labels);

  logger.info(
    {
      scope: "rum.web-vitals",
      metric: name,
      value,
      rating,
      id,
      navigationType,
      path,
      device,
      geo,
      net: clientDevice
        ? {
            effectiveType: clientDevice.effectiveType,
            downlinkMbps: clientDevice.downlinkMbps,
            rttMs: clientDevice.rttMs,
            deviceMemoryGb: clientDevice.deviceMemoryGb,
            hardwareConcurrency: clientDevice.hardwareConcurrency,
          }
        : undefined,
    },
    "web-vital",
  );

  if (rating === "poor") {
    Sentry.captureMessage(`Poor ${name}`, {
      level: "warning",
      tags: {
        metric: name,
        rating,
        navigationType: navigationType ?? "unknown",
        device: device.kind,
        country: geo.country,
        region: geo.region,
      },
      extra: { value, path, id, network: clientDevice },
    });
  }

  return new NextResponse(null, { status: 204 });
}
