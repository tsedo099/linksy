import { NextResponse } from "next/server";
import { checkReadinessDependencies, dependenciesAllOk } from "@/lib/health-readiness-deps";
import { prisma } from "@/lib/prisma";
import { getShutdownState } from "@/lib/shutdown";
import { withMetrics } from "@/lib/with-metrics";

export const runtime = "nodejs";

async function runReadyProbe(): Promise<{
  ok: boolean;
  checks: Record<string, unknown>;
  time: string;
}> {
  const time = new Date().toISOString();
  const checks: Record<string, unknown> = {};

  // Short-circuit during graceful shutdown. We deliberately do NOT touch the
  // DB here — once SIGTERM fires we want k8s to pull the pod out of the
  // Service immediately, not after one more roundtrip.
  const shutdown = getShutdownState();
  if (shutdown.shuttingDown) {
    return {
      ok: false,
      checks: {
        shutdown: {
          ok: false,
          reason: shutdown.reason,
          since: new Date(shutdown.triggeredAt).toISOString(),
        },
      },
      time,
    };
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = { ok: true };
  } catch {
    checks.db = { ok: false };
    return { ok: false, checks, time };
  }

  try {
    const deps = await checkReadinessDependencies();
    checks.redis = deps.redis;
    checks.object_storage = deps.object_storage;
    checks.email = deps.email;
    checks.push_fcm = deps.push_fcm;
    checks.push_apns = deps.push_apns;

    if (!dependenciesAllOk(deps)) {
      return { ok: false, checks, time };
    }

    return { ok: true, checks, time };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.dependencies = { ok: false, detail: msg.slice(0, 300) };
    return { ok: false, checks, time };
  }
}

/** Readiness — DB + optional deps (Redis, object storage, email API, FCM/APNs credentials). */
export const GET = withMetrics("/api/health/ready", async () => {
  const { ok, checks, time } = await runReadyProbe();
  return NextResponse.json(
    { status: ok ? "ok" : "error", probe: "ready", checks, time },
    { status: ok ? 200 : 503 },
  );
});

export const HEAD = withMetrics("/api/health/ready", async () => {
  const { ok } = await runReadyProbe();
  return new NextResponse(null, { status: ok ? 200 : 503 });
});
