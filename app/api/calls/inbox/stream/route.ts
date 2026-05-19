import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getUserCallInboxBus, type CallInboxEvent } from "@/lib/user-call-inbox-bus";
import { isShuttingDown, registerShutdownCloser } from "@/lib/shutdown";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const HEARTBEAT_MS = 25_000;

/**
 * GET /api/calls/inbox/stream — Server-Sent Events for incoming calls
 * targeted at the viewer. Each `incoming` event is the full
 * `CallInboxEvent` JSON; client maps it to a CallSurface in "incoming"
 * mode + ringtone / focus prompt.
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return new Response("Not authenticated.", { status: 401 });

  if (isShuttingDown()) {
    return new Response("Server draining.", {
      status: 503,
      headers: { "Retry-After": "5" },
    });
  }

  const bus = getUserCallInboxBus();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed || req.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      safeEnqueue(`retry: 3000\n\n`);
      safeEnqueue(`event: ready\ndata: {}\n\n`);

      console.log(`[calls/inbox/stream] subscribed user=${me.userId}`);
      const unsubscribe = bus.subscribe(me.userId, (event: CallInboxEvent) => {
        console.log(`[calls/inbox/stream] -> sending incoming event to user=${me.userId} callId=${event.callId}`);
        safeEnqueue(`event: incoming\ndata: ${JSON.stringify(event)}\n\n`);
      });

      const heartbeat = setInterval(() => {
        safeEnqueue(`: ping ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      const unregisterShutdown = registerShutdownCloser(() => {
        safeEnqueue(`event: shutdown\ndata: {"reason":"server_draining"}\n\n`);
        cleanup();
      });

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try { unsubscribe(); } catch { /* ignore */ }
        try { unregisterShutdown(); } catch { /* ignore */ }
        try { controller.close(); } catch { /* ignore */ }
      };

      if (req.signal.aborted) cleanup();
      else req.signal.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
