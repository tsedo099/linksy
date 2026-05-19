import { NextRequest, NextResponse } from "next/server";
import { Queue } from "bullmq";
import {
  activeUsersDaily,
  activeUsersMonthly,
  activeUsersTrailingWeek,
  queueDepth,
  registry,
} from "@/lib/metrics";
import { EMAIL_QUEUE_NAME } from "@/lib/email-queue";
import { activeUsersTrailing, dauForDay, mauForMonth } from "@/lib/active-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Prometheus scrape endpoint. Default in production: require a bearer token
 * (`METRICS_AUTH_TOKEN`). When the env var is unset (e.g. local dev or when
 * the Service is only reachable from a private network) we serve the registry
 * unauthenticated so a local Prometheus / kube-prometheus-stack can scrape
 * without ceremony.
 *
 * The handler refreshes BullMQ queue depth gauges per-scrape so the gauge
 * value stays close to live state without subscribing to every queue event.
 */
export async function GET(req: NextRequest) {
  const required = process.env.METRICS_AUTH_TOKEN?.trim();
  if (required) {
    const header = req.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (!token || !timingSafeEq(token, required)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  await Promise.allSettled([
    refreshQueueDepth(),
    refreshActiveUsers(),
  ]);

  const body = await registry.metrics();
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": registry.contentType },
  });
}

/**
 * BullMQ exposes `getJobCounts(...states)` against the queue, which translates
 * to one MULTI roundtrip. We do it lazily here so the `Queue` instance is only
 * connected when a Prometheus scrape arrives — workers running in a separate
 * process keep their own connections.
 */
async function refreshQueueDepth(): Promise<void> {
  if (!process.env.REDIS_URL?.trim()) return;

  const queues = [EMAIL_QUEUE_NAME];
  for (const name of queues) {
    let q: Queue | null = null;
    try {
      q = new Queue(name, { connection: { url: process.env.REDIS_URL } as never });
      const counts = await q.getJobCounts(
        "waiting",
        "active",
        "delayed",
        "failed",
        "completed",
      );
      queueDepth.set({ queue: name, state: "waiting" }, counts.waiting ?? 0);
      queueDepth.set({ queue: name, state: "active" }, counts.active ?? 0);
      queueDepth.set({ queue: name, state: "delayed" }, counts.delayed ?? 0);
      queueDepth.set({ queue: name, state: "failed" }, counts.failed ?? 0);
    } finally {
      await q?.close().catch(() => undefined);
    }
  }
}

/**
 * DAU/MAU/trailing-7d are surfaced as Prometheus gauges because they're cheap
 * O(1) reads against Redis HLL but expensive to compute against the DB. We
 * refresh on scrape (typically every 15-30s) so the dashboard tracks live
 * state without us running a separate cron rollup.
 */
async function refreshActiveUsers(): Promise<void> {
  if (!process.env.REDIS_URL?.trim()) return;
  const [dau, mau, week] = await Promise.all([
    dauForDay(),
    mauForMonth(),
    activeUsersTrailing(7),
  ]);
  if (dau !== null) activeUsersDaily.set(dau);
  if (mau !== null) activeUsersMonthly.set(mau);
  if (week !== null) activeUsersTrailingWeek.set(week);
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
