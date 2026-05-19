import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Keep-warm probe for Neon Free tier. The compute auto-suspends after 5
 * minutes of inactivity, and the first request after a suspend pays a
 * 0.5–2s wake-up cost. Vercel cron pings this endpoint every 5 minutes
 * so the worst a real user experiences is the cron's own wake-up, not
 * theirs.
 *
 * `SELECT 1` is the cheapest query that still goes through the connection
 * pool and the compute — anything that touches only the pooler (e.g. a
 * SHOW) wouldn't actually wake the suspended compute.
 *
 * Public on purpose: the response leaks nothing, and rate-limiting a
 * 1-byte response would cost more than serving it.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      warmedAt: new Date().toISOString(),
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: (err as Error).message?.slice(0, 200),
        ms: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}
