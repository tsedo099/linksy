import { NextRequest, NextResponse } from "next/server";
import { clientIpFromRequest } from "@/lib/client-ip";
import { logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const CSP_REPORT_LIMIT = { windowMs: 60_000, max: 120 } as const;
const MAX_REPORT_BYTES = 64 * 1024;

function normalizeReportPayload(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  if (Array.isArray(source.reports)) return source.reports;
  if (source["csp-report"]) return [source["csp-report"]];
  return [source];
}

export async function POST(req: NextRequest) {
  const ip = clientIpFromRequest(req);
  const limit = await consumeRateLimit("csp-report", ip, CSP_REPORT_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many reports." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_REPORT_BYTES) {
    return NextResponse.json({ error: "Report too large." }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }

  const reports = normalizeReportPayload(parsed).slice(0, 20);
  for (const report of reports) {
    logger.warn({ scope: "security.csp", report }, "content-security-policy violation");
  }

  return new NextResponse(null, { status: 204 });
}
