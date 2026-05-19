import "server-only";
import Redis from "ioredis";
import { buildRedis } from "@/lib/redis";

/**
 * Pub/sub channel for presence transitions. SSE viewers subscribe to a single
 * peer's `presence-evt:{userId}` channel; `markOnline` / `markOffline` publish
 * here when the actual state flips (no spam every heartbeat).
 *
 * Falls back to in-process delivery without `REDIS_URL`.
 */

export type PresenceEvent = {
  userId: string;
  online: boolean;
  ts: number;
};

type Listener = (event: PresenceEvent) => void;

const channelKey = (userId: string) => `presence-evt:${userId}`;

declare global {
  // eslint-disable-next-line no-var
  var __presenceBus: PresenceBus | undefined;
}

class PresenceBus {
  private localListeners = new Map<string, Set<Listener>>();
  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private subscribed = new Set<string>();

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) return;
    try {
      this.pub = buildRedis(url);
      this.sub = buildRedis(url);
      this.pub.on("error", () => undefined);
      this.sub.on("error", () => undefined);
      this.sub.on("message", (channel, message) => {
        if (!channel.startsWith("presence-evt:")) return;
        const userId = channel.slice("presence-evt:".length);
        try {
          this.deliverLocal(userId, JSON.parse(message) as PresenceEvent);
        } catch {
          /* ignore */
        }
      });
    } catch {
      this.pub = null;
      this.sub = null;
    }
  }

  private deliverLocal(userId: string, event: PresenceEvent) {
    const set = this.localListeners.get(userId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        /* ignore */
      }
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
      this.sub.subscribe(channelKey(userId)).catch(() => {
        this.subscribed.delete(userId);
      });
    }

    return () => {
      const current = this.localListeners.get(userId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.localListeners.delete(userId);
        if (this.sub && this.subscribed.has(userId)) {
          this.subscribed.delete(userId);
          this.sub.unsubscribe(channelKey(userId)).catch(() => undefined);
        }
      }
    };
  }

  async publish(event: PresenceEvent): Promise<void> {
    this.deliverLocal(event.userId, event);
    if (this.pub) {
      try {
        await this.pub.publish(channelKey(event.userId), JSON.stringify(event));
      } catch {
        /* local delivery already done */
      }
    }
  }
}

export function getPresenceBus(): PresenceBus {
  if (!globalThis.__presenceBus) {
    globalThis.__presenceBus = new PresenceBus();
  }
  return globalThis.__presenceBus;
}

export function publishPresenceEvent(userId: string, online: boolean): void {
  void getPresenceBus().publish({ userId, online, ts: Date.now() });
}
