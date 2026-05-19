/**
 * Age + adult-content viewing policy. Used in two places:
 *
 *   - Server: `/api/messages` GET to decide whether to redact a body before
 *     it leaves the database for an under-18 recipient.
 *   - Client: `messages-screen.tsx` to decide whether to show the
 *     "this looks like adult content — show anyway?" reveal dialog.
 *
 * **No account-creation age restriction.** Sign-up is open to all ages. The
 * functions here only gate *how adult content is rendered*, never whether a
 * user can exist on the platform.
 */

export const ADULT_AGE_THRESHOLD = 18;

/** Resolve age in whole years at the comparison date. `null` for unset / malformed birthDate. */
export function computeAgeYears(birthDate: Date | string | null | undefined, at: Date = new Date()): number | null {
  if (!birthDate) return null;
  const d = birthDate instanceof Date ? birthDate : new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  let years = at.getUTCFullYear() - d.getUTCFullYear();
  const m = at.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < d.getUTCDate())) {
    years -= 1;
  }
  return years >= 0 ? years : null;
}

/** True only when birthDate is set AND resolves to under 18. Unknown age (null) is NOT under-18 — it falls back to the adult confirm flow. */
export function isUnder18(birthDate: Date | string | null | undefined, at: Date = new Date()): boolean {
  const age = computeAgeYears(birthDate, at);
  return age !== null && age < ADULT_AGE_THRESHOLD;
}

export type AdultContentVisibility =
  /** Recipient is under 18 — server must redact the body before sending. */
  | "blocked"
  /** Recipient is an adult who has opted into auto-reveal — render inline. */
  | "reveal"
  /** Recipient is an adult (or age unknown) and prefers confirmation. */
  | "confirm";

/**
 * Per-recipient policy for a single piece of adult-flagged content. The
 * server uses `blocked` to decide whether to strip the body; the client uses
 * `reveal` vs `confirm` to decide whether to render the body directly or
 * show the gate first.
 */
export function adultContentVisibility(opts: {
  birthDate: Date | string | null | undefined;
  autoReveal: boolean;
  at?: Date;
}): AdultContentVisibility {
  if (isUnder18(opts.birthDate, opts.at)) return "blocked";
  if (opts.autoReveal) return "reveal";
  return "confirm";
}
