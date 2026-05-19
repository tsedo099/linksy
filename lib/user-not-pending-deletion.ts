import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";

/** Exclude users waiting for GDPR hard-delete (still in DB during grace period). */
export const userNotPendingHardDelete: Prisma.UserWhereInput = {
  accountDeletionRequestedAt: null,
};
