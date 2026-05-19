import "server-only";
import Redis from "ioredis";

/**
 * Per-user "incoming call" bus.
 *
 * Drives `/api/calls/inbox/stream` so the AppShell receives a real-time
 * notification when someone starts a call to the viewer — pops the
 * incoming-call surface without waiting on the web-push payload (which
 * requires VAPID setup + permission).
 *
 * Falls back to in-process delivery when REDIS_URL is unset (dev). Multi-node
 * fan-out requires Redis.
 */

export type CallInboxEvent = {
  userId: string;     // recipient
  callId: string;
  fromUserId: string;
  fromDisplayName: string;
  fromAvatarUrl: string | null;
  conversationId: string;
  kind: "AUDIO" | "VIDEO";
  ts: number;
};

type Listener = (event: CallInboxEvent) => void;

const channelKey = (userId: string) => `call-inbox:${userId}`;

declare global {
  // eslint-disable-next-line no-var
  var __userCallInboxBus: UserCallInboxBus | undefined;
}

class UserCallInboxBus {
  private localListeners = new Map<string, Set<Listener>>();
  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private subscribed = new Set<string>();

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) return;
    try {
      this.pub = new Redis(url, { maxRetriesPerRequest: 2 });
      this.sub = new Redis(url, { maxRetriesPerRequest: 2 });
      this.pub.on("error", () => undefined);
      this.sub.on("error", () => undefined);
      this.sub.on("message", (channel, message) => {
        if (!channel.startsWith("call-inbox:")) return;
        const userId = channel.slice("call-inbox:".length);
        try {
          this.deliverLocal(userId, JSON.parse(message) as CallInboxEvent);
        } catch {
          /* ignore */
        }
      });
    } catch {
      this.pub = null;
      this.sub = null;
    }
  }

  private deliverLocal(userId: string, event: CallInboxEvent) {
    const set = this.localListeners.get(userId);
    if (!set || set.size === 0) {
      console.log(`[call-inbox-bus] no listeners for user=${userId} (callId=${event.callId}) — recipient is not on a (shell) route or SSE not connected yet`);
      return;
    }
    console.log(`[call-inbox-bus] delivering to ${set.size} local listener(s) for user=${userId}`);
    for (const fn of set) {
      try { fn(event); } catch { /* ignore */ }
    }
  }

  subscribe(userId: string, listener: Listener): () => void {
    let set = this.localListeners.get(userId);
    if (!set) {
      set = new Set();
      this.localListeners.set(userId, set);
    }
    set.add(listener);

    if (this.sub && !this.subscribed.has(userId)) {
      this.subscribed.add(userId);
      void this.sub.subscribe(channelKey(userId)).catch(() => undefined);
    }

    return () => {
      const s = this.localListeners.get(userId);
      if (!s) return;
      s.delete(listener);
      if (s.size === 0) {
        this.localListeners.delete(userId);
        if (this.sub && this.subscribed.has(userId)) {
          this.subscribed.delete(userId);
          void this.sub.unsubscribe(channelKey(userId)).catch(() => undefined);
        }
      }
    };
  }

  async publish(event: CallInboxEvent): Promise<void> {
    // Always deliver locally first — same pattern as user-inbox-bus and
    // typing-bus. Skipping this on the Redis-success path was a real bug:
    // the recipient and caller often share one process in dev (single
    // Next.js server), and Redis pub/sub has a small subscribe race at
    // startup where the broker echo can miss. IncomingCallListener guards
    // against duplicates via callId, so an extra delivery is harmless.
    this.deliverLocal(event.userId, event);
    if (this.pub) {
      try {
        await this.pub.publish(channelKey(event.userId), JSON.stringify(event));
      } catch { /* local delivery already happened */ }
    }
  }
}

/**
 * Version tag bumped any time the bus contract changes (e.g. event shape,
 * publish() delivery semantics). Compared against the live singleton so a
 * stale instance left behind by HMR is replaced — without this, dev would
 * keep using the old `publish()` after we edit this file, masking fixes.
 */
const BUS_VERSION = 2;
declare global {
  // eslint-disable-next-line no-var
  var __userCallInboxBusVersion: number | undefined;
}

export function getUserCallInboxBus(): UserCallInboxBus {
  if (!globalThis.__userCallInboxBus || globalThis.__userCallInboxBusVersion !== BUS_VERSION) {
    globalThis.__userCallInboxBus = new UserCallInboxBus();
    globalThis.__userCallInboxBusVersion = BUS_VERSION;
  }
  return globalThis.__userCallInboxBus;
}

export function publishIncomingCall(event: CallInboxEvent): void {
  void getUserCallInboxBus().publish(event);
}
