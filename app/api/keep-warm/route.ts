import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSharedRedis } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Keep-warm probe for Neon Free tier + Redis health check.
 *
 * Neon Free auto-suspends the compute after 5 minutes idle; the SELECT 1
 * here wakes it. The Redis ping doubles as a diagnostic for whether
 * REDIS_URL was actually picked up by this Vercel instance (sensitive
 * env vars sometimes don't survive `vercel env pull` round trips).
 *
 * Public on purpose: response leaks nothing.
 */
export async function GET() {
  const startedAt = Date.now();
  const out: Record<string, unknown> = {
    warmedAt: new Date().toISOString(),
    redisConfigured: Boolean(process.env.REDIS_URL),
  };
  try {
    await prisma.$queryRaw`SELECT 1`;
    out.db = "ok";
  } catch (err) {
    out.db = "fail";
    out.dbError = (err as Error).message?.slice(0, 200);
  }
  const redis = getSharedRedis();
  if (redis) {
    try {
      const pong = await redis.ping();
      out.redis = pong === "PONG" ? "ok" : `unexpected:${pong}`;
    } catch (err) {
      out.redis = "fail";
      out.redisError = (err as Error).message?.slice(0, 200);
    }
  } else {
    out.redis = "no-client";
  }
  out.ms = Date.now() - startedAt;
  return NextResponse.json(out, { status: out.db === "fail" ? 503 : 200 });
}
