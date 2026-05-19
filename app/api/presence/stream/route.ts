import { NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { getPresence } from "@/lib/presence";
import { getPresenceBus, type PresenceEvent } from "@/lib/presence-bus";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { isShuttingDown, registerShutdownCloser } from "@/lib/shutdown";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;
const TTL_SWEEP_MS = 15_000;
const MAX_WATCHED_USERS = 50;

/**
 * GET /api/presence/stream?users=id1,id2,…
 *
 * SSE stream of presence transitions for the specified peer(s). Two
 * mechanisms cooperate so neither path can silently miss events:
 *
 *   1. `presence-bus` pub/sub — fires on explicit `markOnline` /
 *      `markOffline` (heartbeat first-in-window, beacon-on-unload).
 *   2. 15s sweep — detects natural TTL expiry (client process killed
 *      without firing the unload beacon) and emits the offline transition.
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return new Response("Not authenticated.", { status: 401 });

  const usersParam = req.nextUrl.searchParams.get("users") ?? "";
  const requested = usersParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (requested.length === 0) {
    return new Response("`users` query param is required.", { status: 400 });
  }
  if (requested.length > MAX_WATCHED_USERS) {
    return new Response(`Cap is ${MAX_WATCHED_USERS} watched users.`, { status: 400 });
  }

  // Drop blocked peers up front so their presence never leaks here.
  const blockedIds = new Set(await getBlockedUserIds(me.userId));
  const watched = requested.filter((id) => !blockedIds.has(id));
  if (watched.length === 0) {
    return new Response("No watchable users.", { status: 400 });
  }

  if (isShuttingDown()) {
    return new Response("Server draining.", {
      status: 503,
      headers: { "Retry-After": "5" },
    });
  }

  const bus = getPresenceBus();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      safeEnqueue(`retry: 3000\n\n`);

      // Send the initial snapshot so the UI can render immediately without
      // waiting for the first transition.
      const lastKnown = new Map<string, boolean>();
      const initial = await Promise.all(
        watched.map(async (userId) => ({ userId, state: await getPresence(userId) })),
      );
      for (const { userId, state } of initial) {
        lastKnown.set(userId, state.online);
      }
      safeEnqueue(
        `event: initial\ndata: ${JSON.stringify({
          users: initial.map((entry) => ({
            userId: entry.userId,
            online: entry.state.online,
            lastSeenAt: entry.state.lastSeenAt?.toISOString() ?? null,
          })),
        })}\n\n`,
      );

      const subscriptions = watched.map((userId) =>
        bus.subscribe(userId, (event: PresenceEvent) => {
          lastKnown.set(userId, event.online);
          safeEnqueue(`event: presence\ndata: ${JSON.stringify(event)}\n\n`);
        }),
      );

      // TTL sweep — catches the case where a client died without sending the
      // offline beacon. Cheap: a small Redis EXISTS check per watched user.
      const ttlSweep = setInterval(() => {
        void Promise.all(watched.map((userId) => getPresence(userId).then((state) => ({ userId, state }))))
          .then((entries) => {
            for (const { userId, state } of entries) {
              const prev = lastKnown.get(userId);
              if (prev !== state.online) {
                lastKnown.set(userId, state.online);
                safeEnqueue(
                  `event: presence\ndata: ${JSON.stringify({
                    userId,
                    online: state.online,
                    ts: Date.now(),
                  })}\n\n`,
                );
              }
            }
          })
          .catch(() => undefined);
      }, TTL_SWEEP_MS);

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
        clearInterval(ttlSweep);
        for (const unsub of subscriptions) unsub();
        try { unregisterShutdown(); } catch { /* ignore */ }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };

      req.signal.addEventListener("abort", cleanup);
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
