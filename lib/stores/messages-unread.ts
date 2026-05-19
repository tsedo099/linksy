import { create } from "zustand";

/**
 * Shared inbox unread-message count, surfaced as the badge on the
 * navbar Messages icon. AppShell owns the SSE + polling loop that
 * keeps `count` fresh; MessagesScreen can `markActiveRead()` the
 * moment the viewer opens a conversation so the badge updates
 * instantly without waiting for the next server roundtrip.
 */
type MessagesUnreadState = {
  count: number;
  setCount: (next: number) => void;
  /** Optimistically clear — UI shows 0 until next server refresh. */
  markActiveRead: () => void;
};

export const useMessagesUnreadStore = create<MessagesUnreadState>((set) => ({
  count: 0,
  setCount: (next) => set({ count: Math.max(0, next | 0) }),
  markActiveRead: () => set({ count: 0 }),
}));
