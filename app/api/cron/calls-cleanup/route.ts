import { NextRequest, NextResponse } from "next/server";
import { publishCallState } from "@/lib/call-signal-bus";
import { ACCEPTED_ZOMBIE_TIMEOUT_MS, RING_TIMEOUT_MS } from "@/lib/calls";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cron job that defends call state from stuck rows:
 *   - RINGING > 45s → MISSED   (publishes a state event so peer UIs update)
 *   - ACCEPTED > 4h → ENDED    (zombie session — client probably crashed)
 *
 * Run every 30s in production via your scheduler:
 *   `*\/30 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *      https://app.example.com/api/cron/calls-cleanup`
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const ringingCutoff = new Date(now.getTime() - RING_TIMEOUT_MS);
  const acceptedCutoff = new Date(now.getTime() - ACCEPTED_ZOMBIE_TIMEOUT_MS);

  const [ringingStale, acceptedStale] = await Promise.all([
    prisma.call.findMany({
      where: { status: "RINGING", startedAt: { lt: ringingCutoff } },
      select: { id: true },
      take: 500,
    }),
    prisma.call.findMany({
      where: { status: "ACCEPTED", acceptedAt: { lt: acceptedCutoff } },
      select: { id: true, acceptedAt: true },
      take: 500,
    }),
  ]);

  if (ringingStale.length > 0) {
    await prisma.call.updateMany({
      where: { id: { in: ringingStale.map((c) => c.id) }, status: "RINGING" },
      data: { status: "MISSED", endedAt: now },
    });
    for (const c of ringingStale) publishCallState(c.id, "MISSED");
  }

  if (acceptedStale.length > 0) {
    await Promise.all(
      acceptedStale.map((c) => {
        const durationSec = c.acceptedAt
          ? Math.max(0, Math.floor((now.getTime() - c.acceptedAt.getTime()) / 1000))
          : null;
        return prisma.call.update({
          where: { id: c.id },
          data: { status: "ENDED", endedAt: now, durationSec },
        });
      }),
    );
    for (const c of acceptedStale) publishCallState(c.id, "ENDED");
  }

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    missed: ringingStale.length,
    endedZombies: acceptedStale.length,
  });
}

export const GET = handle;
export const POST = handle;
