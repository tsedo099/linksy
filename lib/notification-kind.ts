/**
 * Discrete kinds of notifications surfaced to users (UI badges + push).
 * Lives in its own leaf module so push adapters can reference it without
 * pulling in the heavier `@/lib/notifications` runtime (Prisma + i18n + …).
 */
export type NotificationKind =
  | "like"
  | "comment"
  | "follow"
  | "mention"
  | "post_mention"
  | "story_mention"
  | "story"
  | "message"
  | "message_request"
  | "story_expiring"
  | "friend_joined"
  | "story_reaction"
  | "story_collab";
