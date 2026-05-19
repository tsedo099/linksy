import "server-only";

import { prisma } from "@/lib/prisma";
import { createNotificationIfAllowed } from "@/lib/notifications";
import { logBackgroundError } from "@/lib/logger";
import { areUsersBlocked } from "@/lib/user-blocks";
import { userNotPendingHardDelete } from "@/lib/user-not-pending-deletion";

export const POST_TEXT_MENTIONS_MAX = 20;

/** Instagram-style handles after `@` (alphanumeric, underscore, dot). */
const MENTION_REGEX = /(?<![\w])@([a-zA-Z0-9._]{1,32})/g;

export function extractMentionedUsernames(text: string | null | undefined): string[] {
  if (!text) return [];
  const re = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1]?.trim().toLowerCase();
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= POST_TEXT_MENTIONS_MAX) break;
  }
  return out;
}

async function resolveMentionUserIds(usernames: string[]): Promise<string[]> {
  const unique = [...new Set(usernames.map((u) => u.trim().toLowerCase()).filter(Boolean))];
  if (!unique.length) return [];

  const users = await prisma.user.findMany({
    where: {
      username: { in: unique, mode: "insensitive" },
      deactivatedAt: null,
      ...userNotPendingHardDelete,
    },
    select: { id: true },
  });
  return [...new Set(users.map((user) => user.id))];
}

export async function applyPostMentions(opts: {
  postId: string;
  authorId: string;
  caption: string | null | undefined;
}): Promise<void> {
  const names = extractMentionedUsernames(opts.caption);
  if (!names.length) return;
  const resolvedIds = await resolveMentionUserIds(names);
  const targets = resolvedIds.filter((id) => id !== opts.authorId);
  if (!targets.length) return;

  await prisma.mention.createMany({
    data: targets.map((userId) => ({ postId: opts.postId, userId })),
  });

  await Promise.all(
    targets.map(async (userId) => {
      if (await areUsersBlocked(opts.authorId, userId)) return;
      await createNotificationIfAllowed({
        userId,
        fromId: opts.authorId,
        type: "post_mention",
        postId: opts.postId,
      }).catch(logBackgroundError("notifications.mention.post"));
    }),
  );
}

/**
 * Comment @mentions: notifies mentioned users except the commenter and the post author
 * (post author already gets a "comment" notification when someone else comments).
 */
export async function applyCommentMentions(opts: {
  commentId: string;
  postId: string;
  postAuthorId: string;
  commentAuthorId: string;
  text: string;
}): Promise<void> {
  const names = extractMentionedUsernames(opts.text);
  if (!names.length) return;
  const resolvedIds = await resolveMentionUserIds(names);
  const targets = resolvedIds.filter(
    (id) => id !== opts.commentAuthorId && id !== opts.postAuthorId,
  );
  if (!targets.length) return;

  await prisma.mention.createMany({
    data: targets.map((userId) => ({ commentId: opts.commentId, userId })),
  });

  await Promise.all(
    targets.map(async (userId) => {
      if (await areUsersBlocked(opts.commentAuthorId, userId)) return;
      await createNotificationIfAllowed({
        userId,
        fromId: opts.commentAuthorId,
        type: "mention",
        postId: opts.postId,
      }).catch(logBackgroundError("notifications.mention.comment"));
    }),
  );
}
