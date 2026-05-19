import "server-only";

import { prisma } from "@/lib/prisma";
import { areUsersBlocked } from "@/lib/user-blocks";
import { NotificationType, type Prisma } from "@/lib/generated/prisma/client";

/**
 * Whether the recipient should receive a notification from `actorId`,
 * respecting block (either direction) and mute preferences.
 */
export async function shouldDeliverNotification(
  recipientId: string,
  actorId: string,
  notificationType: NotificationType,
  postId?: string | null,
): Promise<boolean> {
  if (notificationType === NotificationType.story_expiring) return true;
  if (recipientId === actorId) return false;
  if (await areUsersBlocked(recipientId, actorId)) return false;

  const mute = await prisma.mute.findUnique({
    where: { muterId_mutedId: { muterId: recipientId, mutedId: actorId } },
    select: { mutePosts: true, muteStories: true, muteNotifications: true },
  });

  if (mute?.muteNotifications) {
    if (
      notificationType !== NotificationType.message
      && notificationType !== NotificationType.message_request
    ) {
      return false;
    }
  }

  if (!mute) return true;

  const isPostMention =
    notificationType === NotificationType.post_mention
    || (notificationType === NotificationType.mention && Boolean(postId));
  const isStoryMention =
    notificationType === NotificationType.story_mention
    || (notificationType === NotificationType.mention && !postId);

  if (
    mute.mutePosts
    && (notificationType === NotificationType.like
      || notificationType === NotificationType.comment
      || isPostMention)
  ) {
    return false;
  }
  if (
    mute.muteStories
    && (notificationType === NotificationType.story_reaction
      || notificationType === NotificationType.story_collab
      || notificationType === NotificationType.story
      || isStoryMention)
  ) {
    return false;
  }

  return true;
}

/** Prisma filter for the notifications feed (list + unread count). */
export async function notificationFeedWhere(
  recipientId: string,
  blockedUserIds: string[],
): Promise<Prisma.NotificationWhereInput> {
  const mutes = await prisma.mute.findMany({
    where: { muterId: recipientId },
    select: { mutedId: true, mutePosts: true, muteStories: true, muteNotifications: true },
  });

  const muteDeny: Prisma.NotificationWhereInput[] = [];
  for (const m of mutes) {
    if (m.muteNotifications) {
      muteDeny.push({
        NOT: {
          AND: [
            { fromId: m.mutedId },
            {
              type: { notIn: [NotificationType.message, NotificationType.message_request] },
            },
          ],
        },
      });
    }
    if (m.mutePosts) {
      muteDeny.push({
        NOT: {
          AND: [
            { fromId: m.mutedId },
            {
              OR: [
                { type: { in: [NotificationType.like, NotificationType.comment] } },
                { AND: [{ type: { in: [NotificationType.mention, NotificationType.post_mention] } }, { postId: { not: null } }] },
              ],
            },
          ],
        },
      });
    }
    if (m.muteStories) {
      muteDeny.push({
        NOT: {
          AND: [
            { fromId: m.mutedId },
            {
              OR: [
                { type: { in: [NotificationType.story_reaction, NotificationType.story_collab, NotificationType.story, NotificationType.story_mention] } },
                { AND: [{ type: NotificationType.mention }, { postId: null }] },
              ],
            },
          ],
        },
      });
    }
  }

  const postEngagementTypes: NotificationType[] = [
    NotificationType.like,
    NotificationType.comment,
    NotificationType.mention,
    NotificationType.post_mention,
  ];

  return {
    AND: [
      { userId: recipientId },
      { fromId: { notIn: blockedUserIds } },
      {
        OR: [
          {
            type: NotificationType.follow,
            from: { following: { some: { followingId: recipientId } } },
          },
          {
            type: { in: postEngagementTypes },
            postId: { not: null },
          },
          { type: NotificationType.story_mention },
          { type: { in: [NotificationType.story_reaction, NotificationType.story_collab] } },
          { type: NotificationType.mention, postId: null },
          { type: NotificationType.message },
          { type: NotificationType.message_request },
          { type: NotificationType.story },
          { type: NotificationType.story_expiring },
          { type: NotificationType.friend_joined },
        ],
      },
      ...muteDeny,
    ],
  };
}
