import { AVATAR_PLACEHOLDER_GRADIENT } from "@/lib/avatar-placeholder";
import { getMediaUrl, isImageMediaUrl } from "@/lib/media";
import { userProfileHref } from "@/lib/user-url";
import type { NotificationsScreenStrings } from "@/lib/i18n/notifications-screen-copy";

export type NotificationFilter = "all" | "mentions" | "reactions" | "follows" | "system";
/** Group key — translated by the panel via `t.group*`. */
export type NotificationGroup = "today" | "thisWeek" | "earlier";
export type NotificationCategory = Exclude<NotificationFilter, "all">;

export type NotificationItem = {
  id: string;
  fromId: string;
  href: string;
  action: string;
  actor: string;
  avatarUrl: string | null;
  avatarGrad: string;
  /** Extra faces when a like/comment notification is grouped (newest = `actor`). */
  groupStack?: Array<{ avatarUrl: string | null; initials: string; grad: string }>;
  category: NotificationCategory;
  group: NotificationGroup;
  followingActor: boolean;
  initials: string;
  preview?: {
    label: string;
    mediaUrl: string;
  };
  time: string;
  unread: boolean;
  actionButton?: {
    activeLabel?: string;
    label: string;
    kind: "follow";
  };
};

export const GROUP_ORDER: NotificationGroup[] = ["today", "thisWeek", "earlier"];

export const FILTER_VALUES: NotificationFilter[] = ["all", "mentions", "reactions", "follows", "system"];

export function filterLabel(value: NotificationFilter, t: NotificationsScreenStrings): string {
  switch (value) {
    case "all": return t.filterAll;
    case "mentions": return t.filterMentions;
    case "reactions": return t.filterReactions;
    case "follows": return t.filterFollows;
    case "system": return t.filterSystem;
  }
}

export function groupLabel(group: NotificationGroup, t: NotificationsScreenStrings): string {
  switch (group) {
    case "today": return t.groupToday;
    case "thisWeek": return t.groupThisWeek;
    case "earlier": return t.groupEarlier;
  }
}

export type ApiNotification = {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  groupCount?: number;
  groupPeers?: Array<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    followedByMe?: boolean;
  }>;
  from: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    followedByMe?: boolean;
  };
  post: { id: string; mediaUrls: string[] } | null;
  story?: { id: string; mediaUrl: string } | null;
};

export function mapApiNotification(n: ApiNotification, t: NotificationsScreenStrings): NotificationItem {
  const grad = AVATAR_PLACEHOLDER_GRADIENT;
  const name = n.from.displayName || n.from.username;
  const initials = name.slice(0, 2).toUpperCase();
  const when = new Date(n.createdAt);
  const now = new Date();
  const diffMs = now.getTime() - when.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  const time =
    diffMin < 1
      ? t.timeJustNow
      : diffMin < 60
        ? t.timeMin(diffMin)
        : diffH < 24
          ? t.timeHour(diffH)
          : diffD < 7
            ? t.timeDay(diffD)
            : when.toLocaleDateString();
  const group: NotificationGroup = diffD === 0 ? "today" : diffD < 7 ? "thisWeek" : "earlier";

  const typeMap: Record<string, { action: string; category: NotificationCategory }> = {
    like: { action: t.actLike, category: "reactions" },
    comment: { action: t.actComment, category: "reactions" },
    follow: { action: t.actFollow, category: "follows" },
    mention: { action: t.actMention, category: "mentions" },
    post_mention: { action: t.actMentionPost, category: "mentions" },
    story_mention: { action: t.actMentionStory, category: "mentions" },
    story: { action: t.actStoryUpdate, category: "system" },
    message: { action: t.actMessage, category: "system" },
    message_request: { action: t.actMessageRequest, category: "system" },
    story_expiring: { action: t.actStoryExpiring, category: "system" },
    friend_joined: { action: t.actFriendJoined, category: "follows" },
    story_reaction: { action: t.actStoryReaction, category: "reactions" },
    story_collab: { action: t.actStoryCollab, category: "mentions" },
  };
  const mapped = typeMap[n.type] ?? { action: n.type, category: "system" as NotificationCategory };

  const gc = typeof n.groupCount === "number" ? n.groupCount : 1;
  const others = gc - 1;
  let action = mapped.action;
  if (others > 0 && (n.type === "like" || n.type === "comment")) {
    action = n.type === "like" ? t.actLikePlus(others) : t.actCommentPlus(others);
  }

  const peerStack =
    others > 0 && n.groupPeers?.length
      ? n.groupPeers.slice(0, 2).map((p) => {
          const peerGrad = AVATAR_PLACEHOLDER_GRADIENT;
          const nm = p.displayName || p.username;
          return {
            avatarUrl: p.avatarUrl,
            initials: nm.slice(0, 2).toUpperCase(),
            grad: peerGrad,
          };
        })
      : [];

  const groupStack: NotificationItem["groupStack"] | undefined =
    others > 0
      ? [
          { avatarUrl: n.from.avatarUrl, initials, grad },
          ...peerStack,
        ]
      : undefined;
  const previewUrl =
    getMediaUrl(n.post?.mediaUrls.find((url) => isImageMediaUrl(url))) ??
    (n.story?.mediaUrl && isImageMediaUrl(n.story.mediaUrl) ? getMediaUrl(n.story.mediaUrl) : undefined);
  const href =
    n.type === "follow" || n.type === "friend_joined"
      ? userProfileHref(n.from)
      : n.type === "message_request" || n.type === "message"
        ? "/messages"
        : n.post?.id
          ? `/post/${encodeURIComponent(n.post.id)}`
          : n.story?.id
            ? `/story/${encodeURIComponent(n.story.id)}`
            : "/notifications";

  return {
    id: n.id,
    fromId: n.from.id,
    href,
    actor: name,
    action,
    category: mapped.category,
    followingActor: Boolean(n.from.followedByMe),
    group,
    initials,
    time,
    unread: !n.read,
    avatarUrl: n.from.avatarUrl,
    avatarGrad: grad,
    ...(groupStack && groupStack.length > 1 ? { groupStack } : {}),
    ...(n.type === "follow"
      ? {
          actionButton: {
            kind: "follow" as const,
            label: t.followBack,
            activeLabel: t.following,
          },
        }
      : {}),
    ...(previewUrl ? { preview: { label: t.previewLabel, mediaUrl: previewUrl } } : {}),
  };
}
