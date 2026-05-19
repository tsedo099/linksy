import "server-only";

import { CommentModerationStatus } from "@/lib/generated/prisma/client";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Use inside `_count.select` so public-facing comment totals match visible threads. */
export const approvedCommentsOnlyCount = {
  comments: { where: { moderationStatus: CommentModerationStatus.APPROVED } },
} as const;

export function commentThreadWhere(
  viewerId: string,
  postAuthorId: string,
  blockedIds: string[],
): Prisma.CommentWhereInput {
  const notBlocked = { authorId: { notIn: blockedIds } };
  if (viewerId === postAuthorId) {
    return {
      ...notBlocked,
      moderationStatus: { not: CommentModerationStatus.REJECTED },
    };
  }
  return {
    AND: [
      notBlocked,
      {
        OR: [
          { moderationStatus: CommentModerationStatus.APPROVED },
          {
            authorId: viewerId,
            moderationStatus: { not: CommentModerationStatus.REJECTED },
          },
        ],
      },
    ],
  };
}
