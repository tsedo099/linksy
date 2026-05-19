"use client";

import { useCurrentUserStore } from "@/lib/stores/current-user";
import { isUnder18 } from "@/lib/age";

/**
 * `true` when the current viewer is permitted to see / compose adult content.
 *
 * Mirrors the server-side gate in `lib/age-gate.ts`:
 *   - Known under-18 birthDate → `false`
 *   - Unknown (null) birthDate → `true` (legacy users default to adult)
 *   - Adult birthDate → `true`
 *
 * Client UI uses this to *hide* the adult-content composer toggle from users
 * who would be blocked at the API layer anyway, and to decide whether feed
 * surfaces should bother rendering the NSFW chip (the API already strips
 * flagged rows for under-18 viewers).
 *
 * **This is not authorization** — the source of truth for what gets stored
 * is `lib/age-gate.ts`. Treat the hook value as a UX hint only.
 */
export function useViewerIsAdult(): boolean {
  const birthDate = useCurrentUserStore((s) => s.user?.birthDate ?? null);
  return !isUnder18(birthDate);
}
