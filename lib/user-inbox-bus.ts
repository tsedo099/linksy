import "server-only";
import Redis from "ioredis";

/**
 * Per-user "something happened in your inbox" bus.
 *
 * Drives `/api/conversations/stream` so the DM widget + messages-screen
 * sidebar refresh the conversation list the instant a new message lands —
 * even when the user is viewing a different conversation, or just hanging out
 * on the home feed.
 *
 * Falls back to in-process delivery when REDIS_URL is unset (dev). Multi-node
 * fan-out requires Redis.
 */

export type InboxEventReason = "message" | "edit" | "delete" | "react" | "pin" | "create" | "update";

export type InboxEvent = {
  userId: string;
  conversationId: string;
  reason: InboxEventReason;
  ts: number;
};

type Listener = (event: InboxEvent) => void;

const channelKey = (userId: string) => `inbox:${userId}`;

declare global {
  // eslint-disable-next-line no-var
  var __userInboxBus: UserInboxBus | undefined;
}

class UserInboxBus {
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
        if (!channel.startsWith("inbox:")) return;
        const userId = channel.slice("inbox:".length);
        try {
          this.deliverLocal(userId, JSON.parse(message) as InboxEvent);
        } catch {
          /* ignore */
        }
      });
    } catch {
      this.pub = null;
      this.sub = null;
    }
  }

  private deliverLocal(userId: string, event: InboxEvent) {
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

  async publish(event: InboxEvent): Promise<void> {
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

export function getUserInboxBus(): UserInboxBus {
  if (!globalThis.__userInboxBus) {
    globalThis.__userInboxBus = new UserInboxBus();
  }
  return globalThis.__userInboxBus;
}

/** Fan an event out to every member's inbox channel. */
export function publishInboxUpdate(
  userIds: readonly string[],
  conversationId: string,
  reason: InboxEventReason,
): void {
  if (userIds.length === 0) return;
  const bus = getUserInboxBus();
  const ts = Date.now();
  for (const userId of userIds) {
    void bus.publish({ userId, conversationId, reason, ts });
  }
}
