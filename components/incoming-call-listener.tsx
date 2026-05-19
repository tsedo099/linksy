"use client";

import { CallSurface } from "@/components/call/call-surface";
import { useEffect, useRef, useState } from "react";

type IncomingCallEvent = {
  callId: string;
  fromUserId: string;
  fromDisplayName: string;
  fromAvatarUrl: string | null;
  conversationId: string;
  kind: "AUDIO" | "VIDEO";
  ts: number;
};

/**
 * Mounted at AppShell level. Subscribes to the call inbox SSE and pops
 * the CallSurface in "incoming" mode the moment someone calls the viewer.
 * Stays as a single source of truth — even if the viewer is on /home or
 * /messages, the same surface answers (CallSurface itself is fixed-positioned).
 *
 * Deliberately tolerates the surface being dismissed: once the user
 * accepts / declines, `onClosed` clears the state so the next incoming
 * call is handled fresh.
 */
export function IncomingCallListener() {
  const [incoming, setIncoming] = useState<IncomingCallEvent | null>(null);
  // Track callIds the viewer has already handled (declined / accepted /
  // hung up / call ended). SSE reconnects can replay the last "incoming"
  // event, which would re-pop the surface after the user already dismissed
  // it — the dedup happens against this set, not against the live state.
  const dismissedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    console.log("[incoming-call-listener] mounting, opening /api/calls/inbox/stream");
    const es = new EventSource("/api/calls/inbox/stream", { withCredentials: true });

    es.addEventListener("ready", () => console.log("[incoming-call-listener] SSE ready"));
    const onIncoming = (msg: MessageEvent<string>) => {
      console.log("[incoming-call-listener] incoming event received:", msg.data);
      try {
        const event = JSON.parse(msg.data) as IncomingCallEvent;
        if (dismissedRef.current.has(event.callId)) {
          console.log(`[incoming-call-listener] ignoring replay of dismissed call ${event.callId}`);
          return;
        }
        // Drop duplicate fires while the surface is already open for the
        // same callId — prevents flicker on SSE reconnect mid-call.
        setIncoming((current) => (current?.callId === event.callId ? current : event));
      } catch (err) {
        console.warn("[incoming-call-listener] malformed event:", err);
      }
    };

    es.addEventListener("incoming", onIncoming as EventListener);
    es.onerror = (err) => { console.warn("[incoming-call-listener] SSE error (browser will auto-reconnect):", err); };

    return () => {
      es.removeEventListener("incoming", onIncoming as EventListener);
      es.close();
    };
  }, []);

  if (!incoming) return null;

  return (
    <CallSurface
      mode={{ kind: "incoming", callId: incoming.callId, callKind: incoming.kind }}
      peerLabel={incoming.fromDisplayName}
      peerAvatarUrl={incoming.fromAvatarUrl}
      onClosed={() => {
        // Record the callId so any SSE replay (server published twice,
        // browser reconnected, etc.) doesn't re-pop the surface.
        dismissedRef.current.add(incoming.callId);
        // Cap memory: keep only the last 32 dismissed IDs.
        if (dismissedRef.current.size > 32) {
          const first = dismissedRef.current.values().next().value;
          if (first) dismissedRef.current.delete(first);
        }
        setIncoming(null);
      }}
    />
  );
}
