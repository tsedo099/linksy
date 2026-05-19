import "server-only";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const DEFAULT_GRACE_DAYS = 30;

export function gdprHardDeleteGraceDays(): number {
  const raw = process.env.GDPR_HARD_DELETE_GRACE_DAYS?.trim();
  if (raw === undefined || raw === "") return DEFAULT_GRACE_DAYS;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_GRACE_DAYS;
  return Math.min(365 * 2, Math.max(1, n));
}

export type HardDeleteUsersResult = {
  deletedIds: string[];
  cutoffIso: string;
  graceDays: number;
};

/**
 * Permanently deletes users whose account deletion was requested before the grace cutoff.
 */
export async function hardDeleteExpiredAccounts(): Promise<HardDeleteUsersResult> {
  const graceDays = gdprHardDeleteGraceDays();
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

  const pending = await prisma.user.findMany({
    where: {
      accountDeletionRequestedAt: { lte: cutoff },
    },
    select: { id: true },
  });

  const deletedIds: string[] = [];

  for (const row of pending) {
    try {
      await prisma.user.delete({ where: { id: row.id } });
      deletedIds.push(row.id);
    } catch (err) {
      logger.error(
        { scope: "gdpr.hardDelete", userId: row.id, err },
        "failed to hard-delete user",
      );
    }
  }

  return { deletedIds, cutoffIso: cutoff.toISOString(), graceDays };
}
