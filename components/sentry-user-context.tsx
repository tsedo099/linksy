"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import {
  hydrateCurrentUserFromApi,
  useCurrentUserStore,
} from "@/lib/stores/current-user";

/**
 * Mounts in the root layout so every page (logged-in or not) propagates user
 * identity onto Sentry events. We deliberately pass only `id` + `username` —
 * no email — to stay consistent with `sendDefaultPii: false` in
 * `sentry.server.config.ts`.
 *
 * Hydration: kicks `GET /api/auth/me` on first paint (dedup'd inside the
 * store), then mirrors every subsequent store change. Logout sets user to
 * `null`, which clears the Sentry scope.
 */
export function SentryUserContext() {
  useEffect(() => {
    void hydrateCurrentUserFromApi();

    const apply = (user: ReturnType<typeof useCurrentUserStore.getState>["user"]) => {
      if (user?.id) {
        Sentry.setUser({ id: user.id, username: user.username });
      } else {
        Sentry.setUser(null);
      }
    };

    apply(useCurrentUserStore.getState().user);
    return useCurrentUserStore.subscribe((state) => apply(state.user));
  }, []);

  return null;
}
