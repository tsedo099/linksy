import { prisma } from "@/lib/prisma";
import { userNotPendingHardDelete } from "@/lib/user-not-pending-deletion";

export const COAUTHOR_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

export type CoAuthorUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
};

/** Prisma relation include for feed/detail queries. */
export const POST_COLLABORATORS_INCLUDE = {
  collaborators: {
    include: { user: { select: COAUTHOR_USER_SELECT } },
  },
} as const;

export function withCoAuthors<T extends { collaborators?: { user: CoAuthorUser }[] }>(
  p: T,
): Omit<T, "collaborators"> & { coAuthors: CoAuthorUser[] } {
  const coAuthors = (p.collaborators ?? []).map((c) => c.user);
  const { collaborators: _c, ...rest } = p;
  return { ...rest, coAuthors };
}

const MAX_CO_AUTHORS = 5;

/** Resolve up to MAX_CO_AUTHORS usernames (lowercased unique) to user ids; excludes author and deactivated accounts. */
export async function resolvePostCollaboratorIds(
  authorId: string,
  usernames: string[] | undefined,
): Promise<string[]> {
  if (!usernames?.length) return [];
  const cleaned = [...new Set(usernames.map((u) => u.trim().toLowerCase()).filter(Boolean))].slice(
    0,
    MAX_CO_AUTHORS,
  );
  if (!cleaned.length) return [];

  const found = await prisma.user.findMany({
    where: {
      username: { in: cleaned },
      id: { not: authorId },
      deactivatedAt: null,
      ...userNotPendingHardDelete,
    },
    select: { id: true },
  });
  return found.map((u) => u.id);
}
