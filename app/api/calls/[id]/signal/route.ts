import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import {
  getCallSignalBus,
  publishCallSignal,
  type CallSignalEvent,
  type CallStateEvent,
} from "@/lib/call-signal-bus";
import { CALL_SIGNAL_RATE_LIMIT, isConversationParticipant } from "@/lib/calls";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { parseRequestJson } from "@/lib/request-json";
import { callSignalPostSchema } from "@/lib/schemas/api-bodies";
import { isShuttingDown, registerShutdownCloser } from "@/lib/shutdown";

export const runtime = "nodejs";
/** Long-lived SSE — raise on hosts that support it (e.g. Vercel Pro max 300s; self-hosted ignores). */
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const HEARTBEAT_INTERVAL_MS = 15_000;

async function authorizeForCall(callId: string, userId: string) {
  const call = await prisma.call.findUnique({
    where: { id: callId },
    select: { conversationId: true, status: true },
  });
  if (!call) return null;
  if (!(await isConversationParticipant(userId, call.conversationId))) return null;
  return call;
}

/**
 * POST /api/calls/[id]/signal — relay an SDP / ICE event to the other peer(s).
 * Server doesn't inspect the payload; Redis pub/sub does the cross-node fan-out.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const call = await authorizeForCall(id, me.userId);
  if (!call) return NextResponse.json({ error: "Call not found." }, { status: 404 });
  if (call.status !== "RINGING" && call.status !== "ACCEPTED") {
    return NextResponse.json({ error: `Call is ${call.status}.` }, { status: 409 });
  }

  // Per-call per-user rate limit — signaling is chatty (many ICE candidates),
  // so the cap is generous but bounded to stop pathological floods.
  const limit = await consumeRateLimit(`calls:signal:${id}`, me.userId, CALL_SIGNAL_RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many signaling messages." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = await parseRequestJson(req, callSignalPostSchema);
  if (!parsed.ok) return parsed.response;

  publishCallSignal({
    callId: id,
    fromUserId: me.userId,
    kind: parsed.data.kind,
    payload: parsed.data.payload,
  });

  return new NextResponse(null, { status: 204 });
}

/**
 * GET /api/calls/[id]/signal — Server-Sent Events stream that fans both
 * `state` (lifecycle) and `signal` (SDP/ICE) events to the calling client.
 * Filters out the viewer's own published signals so they don't echo back.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const call = await authorizeForCall(id, me.userId);
  if (!call) return NextResponse.json({ error: "Call not found." }, { status: 404 });

  if (isShuttingDown()) {
    // Don't accept new SSE during drain; the client retries against another pod.
    return NextResponse.json(
      { error: "Server draining." },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }

  const bus = getCallSignalBus();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed || req.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Hint to clients: keep the connection re-tried with a 2s backoff.
      // (Raw enqueue — `send` formats `event:`/`data:` pairs, while we need
      // the bare `retry:` SSE field.)
      if (!req.signal.aborted) {
        try { controller.enqueue(encoder.encode(`retry: 2000\n\n`)); }
        catch { closed = true; }
      }

      console.log(`[calls/signal] user=${me.userId} subscribed for callId=${id}`);
      const unsubState = bus.subscribeState(id, (event: CallStateEvent) => {
        console.log(`[calls/signal] -> sending state=${event.status} to user=${me.userId} callId=${id}`);
        send("state", event);
      });
      const unsubSignal = bus.subscribeSignal(id, (event: CallSignalEvent) => {
        if (event.fromUserId === me.userId) return; // don't echo our own publishes
        send("signal", event);
      });

      const heartbeat = setInterval(() => {
        if (closed || req.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`: hb\n\n`));
        } catch {
          closed = true;
        }
      }, HEARTBEAT_INTERVAL_MS);

      const unregisterShutdown = registerShutdownCloser(() => {
        // Best-effort `state` event tells the client to drop this PC and
        // reconnect — for an active call, the UI will renegotiate ICE.
        send("state", { kind: "server_draining" });
        cleanup();
      });

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try { unsubState(); } catch { /* ignore */ }
        try { unsubSignal(); } catch { /* ignore */ }
        try { unregisterShutdown(); } catch { /* ignore */ }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      if (req.signal.aborted) cleanup();
      else req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      // No-op — the abort listener in `start` already drives cleanup.
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
