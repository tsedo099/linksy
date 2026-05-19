import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getNotificationBus, type NotificationEvent } from "@/lib/notification-bus";
import { isShuttingDown, registerShutdownCloser } from "@/lib/shutdown";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const HEARTBEAT_MS = 25_000;

/**
 * GET /api/notifications/stream — Server-Sent Events for the caller's
 * notifications. Replaces the 5s polling loops in `app-shell.tsx` and
 * `notifications-screen.tsx`. Clients should refetch `GET /api/notifications`
 * when they receive an `activity` event so the list + unread count refresh
 * with the same payload they already understand.
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return new Response("Not authenticated.", { status: 401 });

  // Refuse new SSE connections once shutdown has begun. The client's
  // EventSource will retry against a healthy pod after the cooldown.
  if (isShuttingDown()) {
    return new Response("Server draining.", {
      status: 503,
      headers: { "Retry-After": "5" },
    });
  }

  const bus = getNotificationBus();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        // Short-circuit once the client has disconnected — without this the
        // controller still accepts the chunk, then Node's response writer
        // hits a dead socket and emits an unhandled ECONNRESET.
        if (closed || req.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      safeEnqueue(`retry: 3000\n\n`);
      safeEnqueue(`event: ready\ndata: {}\n\n`);

      const unsubscribe = bus.subscribe(me.userId, (event: NotificationEvent) => {
        safeEnqueue(`event: activity\ndata: ${JSON.stringify(event)}\n\n`);
      });

      const heartbeat = setInterval(() => {
        safeEnqueue(`: ping ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      // On SIGTERM, send a `shutdown` event so the EventSource client knows
      // this is a planned drain (not a crash) and can reconnect immediately.
      const unregisterShutdown = registerShutdownCloser(() => {
        safeEnqueue(`event: shutdown\ndata: {"reason":"server_draining"}\n\n`);
        cleanup();
      });

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          unsubscribe();
        } catch {
          /* ignore */
        }
        try {
          unregisterShutdown();
        } catch {
          /* ignore */
        }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      // Fire cleanup synchronously on abort so no further chunks queue up.
      if (req.signal.aborted) cleanup();
      else req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      // Triggered when Node's response pipe tears down (e.g. client closed
      // the connection before our abort handler fired). Idempotent — the
      // start-callback `cleanup` already guards re-entry.
      // No-op body; cleanup runs via the abort listener wired in `start`.
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
