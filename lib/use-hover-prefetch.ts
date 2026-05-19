"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef } from "react";

/**
 * Returns event handlers that warm the route bundle + RSC payload for `href`
 * on user intent (hover, focus, touch). One prefetch per href per session
 * lifetime — repeated mouseenter events do not re-fire.
 *
 * Pair with `<Link prefetch={false}>` so we control prefetching explicitly
 * (avoid the default viewport prefetch when the user has not signaled intent).
 */
export function useHoverPrefetch(href: string | undefined) {
  const router = useRouter();
  const prefetched = useRef<Set<string>>(new Set());

  const trigger = useCallback(() => {
    if (!href) return;
    if (prefetched.current.has(href)) return;
    prefetched.current.add(href);
    try {
      router.prefetch(href);
    } catch {
      /* prefetch is best-effort */
    }
  }, [href, router]);

  return useMemo(
    () => ({
      onMouseEnter: trigger,
      onFocus: trigger,
      onTouchStart: trigger,
      onPointerEnter: trigger,
    }),
    [trigger],
  );
}
