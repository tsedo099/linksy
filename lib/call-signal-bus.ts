import "server-only";
import Redis from "ioredis";

import { logger } from "./logger";

let warnedMissingRedis = false;

function warnProductionWithoutRedis(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.REDIS_URL?.trim()) return;
  if (warnedMissingRedis) return;
  warnedMissingRedis = true;
  logger.warn(
    "REDIS_URL is unset: call signaling only reaches peers on the same Node process. Set REDIS_URL for production when running more than one instance.",
  );
}

/**
 * Bus for real-time call events. Two channels per call:
 *   - `call:state:{id}` — lifecycle transitions (RINGING → ACCEPTED → ENDED, etc.)
 *   - `call:signal:{id}` — opaque WebRTC payloads (SDP offer/answer, ICE candidates)
 *
 * Falls back to in-process delivery when REDIS_URL is unset (dev). Signaling
 * peer-to-peer across nodes requires Redis; same-process calls work either way.
 */

export type CallStateEvent = {
  callId: string;
  status: string;
  ts: number;
};

export type CallSignalKind = "offer" | "answer" | "ice-candidate";

export type CallSignalEvent = {
  callId: string;
  fromUserId: string;
  kind: CallSignalKind;
  payload: unknown;
  ts: number;
};

type StateListener = (event: CallStateEvent) => void;
type SignalListener = (event: CallSignalEvent) => void;

type Channel = "state" | "signal";

const channelKey = (kind: Channel, callId: string) => `call:${kind}:${callId}`;

declare global {
  // eslint-disable-next-line no-var
  var __callSignalBus: CallSignalBus | undefined;
}

class CallSignalBus {
  private stateListeners = new Map<string, Set<StateListener>>();
  private signalListeners = new Map<string, Set<SignalListener>>();
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
        if (channel.startsWith("call:state:")) {
          const callId = channel.slice("call:state:".length);
          try {
            this.deliverState(callId, JSON.parse(message) as CallStateEvent);
          } catch {
            /* ignore */
          }
        } else if (channel.startsWith("call:signal:")) {
          const callId = channel.slice("call:signal:".length);
          try {
            this.deliverSignal(callId, JSON.parse(message) as CallSignalEvent);
          } catch {
            /* ignore */
          }
        }
      });
    } catch {
      this.pub = null;
      this.sub = null;
    }
  }

  private deliverState(callId: string, event: CallStateEvent) {
    const set = this.stateListeners.get(callId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        /* ignore */
      }
    }
  }

  private deliverSignal(callId: string, event: CallSignalEvent) {
    const set = this.signalListeners.get(callId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch {
        /* ignore */
      }
    }
  }

  private ensureSubscribed(kind: Channel, callId: string) {
    if (!this.sub) return;
    const key = channelKey(kind, callId);
    if (this.subscribed.has(key)) return;
    this.subscribed.add(key);
    this.sub.subscribe(key).catch(() => {
      this.subscribed.delete(key);
    });
  }

  private maybeUnsubscribe(kind: Channel, callId: string) {
    if (!this.sub) return;
    const key = channelKey(kind, callId);
    const stateSet = this.stateListeners.get(callId);
    const signalSet = this.signalListeners.get(callId);
    const stillUsed =
      (kind === "state" ? Boolean(stateSet?.size) : Boolean(signalSet?.size));
    if (stillUsed) return;
    this.subscribed.delete(key);
    this.sub.unsubscribe(key).catch(() => undefined);
  }

  subscribeState(callId: string, listener: StateListener): () => void {
    let set = this.stateListeners.get(callId);
    if (!set) {
      set = new Set();
      this.stateListeners.set(callId, set);
    }
    set.add(listener);
    this.ensureSubscribed("state", callId);
    return () => {
      const current = this.stateListeners.get(callId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.stateListeners.delete(callId);
      this.maybeUnsubscribe("state", callId);
    };
  }

  subscribeSignal(callId: string, listener: SignalListener): () => void {
    let set = this.signalListeners.get(callId);
    if (!set) {
      set = new Set();
      this.signalListeners.set(callId, set);
    }
    set.add(listener);
    this.ensureSubscribed("signal", callId);
    return () => {
      const current = this.signalListeners.get(callId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.signalListeners.delete(callId);
      this.maybeUnsubscribe("signal", callId);
    };
  }

  async publishState(event: CallStateEvent): Promise<void> {
    if (!this.pub) warnProductionWithoutRedis();
    const listenerCount = this.stateListeners.get(event.callId)?.size ?? 0;
    console.log(`[call-signal-bus] publishState ${event.status} callId=${event.callId} localListeners=${listenerCount}`);
    this.deliverState(event.callId, event);
    if (this.pub) {
      try {
        await this.pub.publish(channelKey("state", event.callId), JSON.stringify(event));
      } catch {
        /* local delivery already done */
      }
    }
  }

  async publishSignal(event: CallSignalEvent): Promise<void> {
    if (!this.pub) warnProductionWithoutRedis();
    this.deliverSignal(event.callId, event);
    if (this.pub) {
      try {
        await this.pub.publish(channelKey("signal", event.callId), JSON.stringify(event));
      } catch {
        /* local delivery already done */
      }
    }
  }
}

export function getCallSignalBus(): CallSignalBus {
  if (!globalThis.__callSignalBus) {
    globalThis.__callSignalBus = new CallSignalBus();
  }
  return globalThis.__callSignalBus;
}

export function publishCallState(callId: string, status: string): void {
  void getCallSignalBus().publishState({ callId, status, ts: Date.now() });
}

export function publishCallSignal(input: Omit<CallSignalEvent, "ts">): void {
  void getCallSignalBus().publishSignal({ ...input, ts: Date.now() });
}
