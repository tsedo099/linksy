import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getUserInboxBus, type InboxEvent } from "@/lib/user-inbox-bus";
import { isShuttingDown, registerShutdownCloser } from "@/lib/shutdown";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Hobby plan default is 10s — kills SSE every 10s, killing real-time
// during the EventSource reconnect window. 60s is the Hobby ceiling.
export const maxDuration = 60;

const HEARTBEAT_MS = 25_000;

/**
 * GET /api/conversations/stream — Server-Sent Events for the caller's inbox.
 *
 * Replaces the 30s polling in `feed-dm-widget.tsx`. Clients should refetch
 * `GET /api/conversations` when they receive an `activity` event so the list
 * + last-message previews + unread counts refresh.
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

  const bus = getUserInboxBus();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        // Short-circuit once the client disconnects so Node never tries to
        // write to a dead socket (the source of unhandled ECONNRESET noise).
        if (closed || req.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      safeEnqueue(`retry: 3000\n\n`);
      safeEnqueue(`event: ready\ndata: {}\n\n`);

      const unsubscribe = bus.subscribe(me.userId, (event: InboxEvent) => {
        safeEnqueue(`event: activity\ndata: ${JSON.stringify(event)}\n\n`);
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

      if (req.signal.aborted) cleanup();
      else req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      // No-op — abort listener in `start` already drives cleanup.
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
