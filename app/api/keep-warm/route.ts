import { NextResponse } from "next/server";
import Redis from "ioredis";
import { prisma } from "@/lib/prisma";

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
  // Parse the URL ourselves and pass explicit constructor args, in case
  // ioredis is mangling the URL (special chars, missing tls, etc.).
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const u = new URL(redisUrl.trim());
      out.redisHost = u.hostname;
      out.redisPort = u.port;
      out.redisUsername = u.username;
      out.redisProtocol = u.protocol;
      const r = new Redis({
        host: u.hostname,
        port: Number(u.port || 6379),
        username: u.username || "default",
        password: decodeURIComponent(u.password),
        tls: u.protocol === "rediss:" ? {} : undefined,
        maxRetriesPerRequest: 3,
        connectTimeout: 6000,
        family: 0,
        lazyConnect: true,
      });
      try {
        await r.connect();
        const pong = await r.ping();
        out.redis = pong === "PONG" ? "ok" : `unexpected:${pong}`;
      } catch (err) {
        out.redis = "fail";
        out.redisError = (err as Error).message?.slice(0, 200);
        const cause = (err as { cause?: Error })?.cause;
        if (cause) out.redisCause = (cause as Error).message?.slice(0, 200);
      } finally {
        r.disconnect();
      }
    } catch (err) {
      out.redis = "url-parse-fail";
      out.redisError = (err as Error).message?.slice(0, 200);
    }
  } else {
    out.redis = "no-client";
  }
  out.ms = Date.now() - startedAt;
  return NextResponse.json(out, { status: out.db === "fail" ? 503 : 200 });
}
