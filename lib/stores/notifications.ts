import { create } from "zustand";

/**
 * Shape of a notification preview shown in the bell dropdown. Mirrors the API
 * response from `GET /api/notifications` (limited to the fields the UI reads).
 */
export type ShellNotif = {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  from: { id: string; username: string; displayName: string; avatarUrl: string | null };
  post: { id: string; mediaUrls: string[] } | null;
  story?: { id: string; mediaUrl: string } | null;
};

type State = {
  /** Unread count rendered as the bell-icon badge. */
  unreadCount: number;
  /** Latest few notifications shown in the bell dropdown. */
  recent: ShellNotif[];
  /** True once the first fetch resolves — prevents the "0" flash on cold render. */
  initialized: boolean;
  /** Last successful refresh timestamp (epoch ms); used to throttle redundant calls. */
  lastFetchedAt: number;
  setSnapshot: (snapshot: { unreadCount: number; recent: ShellNotif[] }) => void;
  setUnreadCount: (n: number) => void;
  markAllRead: () => void;
  patchNotification: (id: string, patch: Partial<ShellNotif>) => void;
  reset: () => void;
};

/**
 * Process-wide notifications store. AppShell + any future widget can subscribe
 * without duplicating the fetch + SSE wiring.
 */
export const useNotificationsStore = create<State>((set) => ({
  unreadCount: 0,
  recent: [],
  initialized: false,
  lastFetchedAt: 0,
  setSnapshot: ({ unreadCount, recent }) =>
    set({
      unreadCount: Math.max(0, unreadCount | 0),
      recent: Array.isArray(recent) ? recent : [],
      initialized: true,
      lastFetchedAt: Date.now(),
    }),
  setUnreadCount: (n) => set({ unreadCount: Math.max(0, n | 0) }),
  markAllRead: () =>
    set((current) => ({
      unreadCount: 0,
      recent: current.recent.map((n) => ({ ...n, read: true })),
    })),
  patchNotification: (id, patch) =>
    set((current) => ({
      recent: current.recent.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    })),
  reset: () => set({ unreadCount: 0, recent: [], initialized: false, lastFetchedAt: 0 }),
}));
