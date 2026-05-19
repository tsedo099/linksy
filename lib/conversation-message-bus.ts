import "server-only";
import Redis from "ioredis";
import { prisma } from "@/lib/prisma";
import { publishInboxUpdate } from "@/lib/user-inbox-bus";

export type ConversationMessageReason = "message" | "edit" | "delete" | "react" | "pin" | "read";

const MEMBER_CACHE_TTL_MS = 30_000;
const memberCache = new Map<string, { members: string[]; expiresAt: number }>();

async function membersForConversation(conversationId: string): Promise<string[]> {
  const now = Date.now();
  const cached = memberCache.get(conversationId);
  if (cached && cached.expiresAt > now) return cached.members;

  const rows = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  const members = rows.map((r) => r.userId);
  memberCache.set(conversationId, { members, expiresAt: now + MEMBER_CACHE_TTL_MS });
  return members;
}

/** Drop the cached membership list — call after add/remove/leave operations. */
export function invalidateConversationMembersCache(conversationId: string): void {
  memberCache.delete(conversationId);
}

export type ConversationMessageEvent = {
  conversationId: string;
  ts: number;
  reason: ConversationMessageReason;
};

type Listener = (event: ConversationMessageEvent) => void;

const channelKey = (conversationId: string) => `convmsg:${conversationId}`;

declare global {
  // eslint-disable-next-line no-var
  var __conversationMessageBus: ConversationMessageBus | undefined;
}

class ConversationMessageBus {
  private localListeners = new Map<string, Set<Listener>>();
  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private subscribed = new Set<string>();

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) return;
    try {
      this.pub = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
      this.sub = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
      this.pub.on("error", () => { /* Redis optional */ });
      this.sub.on("error", () => { /* ignore */ });
      this.sub.on("message", (channel, message) => {
        const conversationId = channel.startsWith("convmsg:") ? channel.slice("convmsg:".length) : null;
        if (!conversationId) return;
        try {
          const event = JSON.parse(message) as ConversationMessageEvent;
          this.deliverLocal(conversationId, event);
        } catch { /* ignore */ }
      });
    } catch {
      this.pub = null;
      this.sub = null;
    }
  }

  private deliverLocal(conversationId: string, event: ConversationMessageEvent) {
    const set = this.localListeners.get(conversationId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch { /* ignore */ }
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

  async publish(event: ConversationMessageEvent): Promise<void> {
    this.deliverLocal(event.conversationId, event);
    if (this.pub) {
      try {
        await this.pub.publish(channelKey(event.conversationId), JSON.stringify(event));
      } catch { /* local delivery done */ }
    }
  }
}

export function getConversationMessageBus(): ConversationMessageBus {
  if (!globalThis.__conversationMessageBus) {
    globalThis.__conversationMessageBus = new ConversationMessageBus();
  }
  return globalThis.__conversationMessageBus;
}

export function publishConversationMessageActivity(
  conversationId: string,
  reason: ConversationMessageReason,
): void {
  const event: ConversationMessageEvent = { conversationId, reason, ts: Date.now() };
  void getConversationMessageBus().publish(event);

  // Fan out to each member's per-user inbox channel so the conversation list
  // (DM widget, messages-screen sidebar) updates without polling. Membership
  // is cached for 30s to keep this off the hot path during burst chatter.
  // `read` events are intentionally skipped — they don't change inbox-list
  // ordering or previews, so re-fetching the inbox on every read is waste.
  if (reason !== "read") {
    void membersForConversation(conversationId)
      .then((memberIds) => publishInboxUpdate(memberIds, conversationId, reason))
      .catch(() => undefined);
  }
}
