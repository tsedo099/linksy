import { NextResponse } from "next/server";
import { withMetrics } from "@/lib/with-metrics";

export const runtime = "nodejs";

/** Kubernetes / load balancer liveness — no DB; process must respond quickly. */
export const GET = withMetrics("/api/health", async () => {
  return NextResponse.json({
    status: "ok",
    probe: "live",
    service: "diplom",
    time: new Date().toISOString(),
  });
});

export const HEAD = withMetrics("/api/health", async () => {
  return new NextResponse(null, { status: 200 });
});
