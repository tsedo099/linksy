import "server-only";
import Redis from "ioredis";
import { buildRedis } from "@/lib/redis";

/**
 * Per-user real-time bus for notification events. The SSE endpoint
 * `/api/notifications/stream` subscribes to one channel per connected user;
 * notification creates / read-marks publish here so connected clients refresh
 * instantly instead of polling `GET /api/notifications` every 5 seconds.
 *
 * Falls back to in-process delivery when REDIS_URL is unset (dev). Cross-node
 * fan-out requires Redis — same-process delivery still works without it.
 */

export type NotificationEventReason = "created" | "read" | "deleted";

export type NotificationEvent = {
  userId: string;
  reason: NotificationEventReason;
  ts: number;
};

type Listener = (event: NotificationEvent) => void;

const channelKey = (userId: string) => `notif:${userId}`;

declare global {
  // eslint-disable-next-line no-var
  var __notificationBus: NotificationBus | undefined;
}

class NotificationBus {
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
        if (!channel.startsWith("notif:")) return;
        const userId = channel.slice("notif:".length);
        try {
          this.deliverLocal(userId, JSON.parse(message) as NotificationEvent);
        } catch {
          /* ignore */
        }
      });
    } catch {
      this.pub = null;
      this.sub = null;
    }
  }

  private deliverLocal(userId: string, event: NotificationEvent) {
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

  async publish(event: NotificationEvent): Promise<void> {
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

export function getNotificationBus(): NotificationBus {
  if (!globalThis.__notificationBus) {
    globalThis.__notificationBus = new NotificationBus();
  }
  return globalThis.__notificationBus;
}

export function publishNotificationEvent(userId: string, reason: NotificationEventReason): void {
  void getNotificationBus().publish({ userId, reason, ts: Date.now() });
}
