import { create } from "zustand";

/** Mirrors GET /api/auth/me `user` — shared across shell, feed, profile (viewer id). */
export type CurrentUserAvatarData = {
  avatarUrl: string | null;
  displayName: string;
  email?: string;
  id?: string;
  username?: string;
  /**
   * ISO date string for the viewer's self-declared birthday. Used by
   * `useViewerIsAdult` to decide whether to render the "Contains adult
   * content" composer toggle. Unset means "treat as adult" (legacy users).
   */
  birthDate?: string | null;
  /** Whether the viewer has opted to auto-reveal adult messages without confirm. */
  autoRevealAdultContent?: boolean;
};

type CurrentUserState = {
  user: CurrentUserAvatarData | null;
  setUser: (user: CurrentUserAvatarData | null) => void;
  patchUser: (partial: Partial<CurrentUserAvatarData>) => void;
};

export const useCurrentUserStore = create<CurrentUserState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  patchUser: (partial) =>
    set((s) => {
      if (!s.user) {
        return { user: partial as CurrentUserAvatarData };
      }
      return { user: { ...s.user, ...partial } };
    }),
}));

let hydrateInflight: Promise<void> | null = null;
let lastHydratedAt = 0;
const HYDRATE_TTL_MS = 30_000;

/**
 * Deduplicates concurrent calls and skips re-fetching for HYDRATE_TTL_MS after
 * a successful hydrate, so independent components mounting in rapid succession
 * don't each hit /api/auth/me. Pass `force` to bypass the TTL (e.g. post-login
 * or post-profile-update).
 */
export function hydrateCurrentUserFromApi(force = false): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (hydrateInflight) return hydrateInflight;
  if (!force && Date.now() - lastHydratedAt < HYDRATE_TTL_MS) return Promise.resolve();
  hydrateInflight = fetch("/api/auth/me")
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data?.user) {
        useCurrentUserStore.getState().setUser(data.user as CurrentUserAvatarData);
      }
      lastHydratedAt = Date.now();
    })
    .catch(() => {})
    .finally(() => {
      hydrateInflight = null;
    });
  return hydrateInflight;
}
