import type { AppLanguage } from "@/lib/language";

export type ProfileUser = {
  allowGroupInvites: boolean;
  allowMessageRequests: boolean;
  allowStoryReplies: boolean;
  /** Defaults for Settings → Privacy and new-create flow */
  defaultAllowComments: boolean;
  defaultHideLikes: boolean;
  avatarUrl: string | null;
  bio: string | null;
  displayName: string;
  email: string;
  emailVerified: boolean;
  id: string;
  showFollowers: boolean;
  showFollowing: boolean;
  /** Email, push, digest copy + server sync */
  preferredLanguage: AppLanguage;
  twoFactorEnabled?: boolean;
  username: string;
  /** From GET /api/auth/me — Prisma `SubscriptionTier` */
  subscriptionTier?: string;
  subscriptionExpiresAt?: string | null;
  /** False when the user only uses Google sign-in and has not set a password yet. */
  hasPassword?: boolean;
};

export type ToastState = {
  kind: "error" | "success";
  message: string;
} | null;

export type BlockedUser = {
  avatarUrl: string | null;
  bio: string | null;
  blockedAt: string;
  displayName: string;
  id: string;
  isVerified: boolean;
  username: string;
};

export type MutedUser = {
  avatarUrl: string | null;
  bio: string | null;
  mutedAt: string;
  mutePosts: boolean;
  muteStories: boolean;
  muteNotifications: boolean;
  displayName: string;
  id: string;
  isVerified: boolean;
  username: string;
};

export type PageKey =
  | "edit-profile"
  | "notifications"
  | "privacy"
  | "blocked"
  | "story"
  | "messages"
  | "tags"
  | "comments"
  | "muted"
  | "appearance"
  | "language"
  | "help"
  | "creator-mode"
  | "billing"
  | "developer"
  | "change-password"
  | "security-overview"
  | "sessions"
  | "two-factor"
  | "passkeys"
  | "delete-account"
  | "deactivate-account"
  | "export-data"
  | "help-center"
  | "privacy-policy"
  | "cookie-policy"
  | "contact-support";

export type ServerNotifPrefs = {
  like: boolean;
  comment: boolean;
  follow: boolean;
  mention: boolean;
  story: boolean;
  message: boolean;
  friendJoined: boolean;
};

export type DigestCadence = "off" | "daily" | "weekly";

export type ServerDigestState = {
  cadence: DigestCadence;
  lastSentAt: string | null;
};

export type ToastHandler = (kind: "error" | "success", message: string) => void;

export const AVATAR_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
export const AVATAR_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
