import Redis from "ioredis";
import { buildRedis } from "@/lib/redis";

export type TypingUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type TypingEvent = {
  conversationId: string;
  user: TypingUser;
  typing: boolean;
  expiresAt: string;
  ts: number;
};

type Listener = (event: TypingEvent) => void;

const channelKey = (conversationId: string) => `typing:${conversationId}`;

declare global {
  // eslint-disable-next-line no-var
  var __typingBus: TypingBus | undefined;
}

class TypingBus {
  private localListeners = new Map<string, Set<Listener>>();
  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private subscribed = new Set<string>();
  // Snapshot/cache deliberately omitted — the GET /api/conversations/[id]/typing
  // endpoint reads from `prisma.conversationTyping` directly (DB is the
  // single source of truth, survives restarts, works across instances).

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) return;
    try {
      this.pub = buildRedis(url);
      this.sub = buildRedis(url);
      this.pub.on("error", () => { /* silent — Redis is optional */ });
      this.sub.on("error", () => { /* silent */ });
      this.sub.on("message", (channel, message) => {
        const conversationId = channel.startsWith("typing:") ? channel.slice("typing:".length) : null;
        if (!conversationId) return;
        try {
          const event = JSON.parse(message) as TypingEvent;
          this.deliverLocal(conversationId, event);
        } catch { /* ignore malformed */ }
      });
    } catch {
      this.pub = null;
      this.sub = null;
    }
  }

  private deliverLocal(conversationId: string, event: TypingEvent) {
    const set = this.localListeners.get(conversationId);
    if (!set) return;
    for (const listener of set) {
      try { listener(event); } catch { /* ignore listener errors */ }
    }
  }

  subscribe(conversationId: string, listener: Listener): () => void {
    let set = this.localListeners.get(conversationId);
    if (!set) {
      set = new Set();
      this.localListeners.set(conversationId, set);
    }
    set.add(listener);

    if (this.sub && !this.subscribed.has(conversationId)) {
      this.subscribed.add(conversationId);
      this.sub.subscribe(channelKey(conversationId)).catch(() => {
        this.subscribed.delete(conversationId);
      });
    }

    return () => {
      const current = this.localListeners.get(conversationId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.localListeners.delete(conversationId);
        if (this.sub && this.subscribed.has(conversationId)) {
          this.subscribed.delete(conversationId);
          this.sub.unsubscribe(channelKey(conversationId)).catch(() => { /* ignore */ });
        }
      }
    };
  }

  async publish(event: TypingEvent): Promise<void> {
    this.deliverLocal(event.conversationId, event);
    if (this.pub) {
      try {
        await this.pub.publish(channelKey(event.conversationId), JSON.stringify(event));
      } catch { /* ignore — local delivery already happened */ }
    }
  }
}

export function getTypingBus(): TypingBus {
  if (!globalThis.__typingBus) {
    globalThis.__typingBus = new TypingBus();
  }
  return globalThis.__typingBus;
}
