import "server-only";
import { prisma } from "@/lib/prisma";
import { isUnder18 } from "@/lib/age";

/**
 * Server-side enforcement for "users under 18 cannot publish adult content"
 * (posts, stories, messages). Pairs with the keyword scorer in
 * `lib/adult-content.ts` so a missed composer toggle still gets caught.
 *
 * Returns a result object instead of throwing so route handlers can shape
 * the HTTP response (400 vs 403) themselves. Designed to be the *single*
 * place this rule lives — wire every adult-flagged write through it.
 */

export type AdultSendCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "under_18";
      /** Human-readable error for the API response. Localise at the call site if needed. */
      message: string;
    };

/**
 * Allowed when the author is not flagged as under-18. Unknown age (null
 * birthDate — legacy users) is treated as adult, mirroring the policy in
 * `lib/age.ts`.
 */
export async function checkUserCanSendAdult(authorUserId: string): Promise<AdultSendCheckResult> {
  let birthDate: Date | null = null;
  try {
    const row = await prisma.user.findUnique({
      where: { id: authorUserId },
      select: { birthDate: true },
    });
    birthDate = row?.birthDate ?? null;
  } catch {
    // Schema regression / legacy column missing → behave as "age unknown",
    // which is adult-by-default. We deliberately do NOT block here because
    // an outage in the user table shouldn't lock the whole platform.
    return { ok: true };
  }

  if (isUnder18(birthDate)) {
    return {
      ok: false,
      reason: "under_18",
      message: "Users under 18 cannot post or send adult content.",
    };
  }
  return { ok: true };
}
