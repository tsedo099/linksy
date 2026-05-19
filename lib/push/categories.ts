import type { NotificationKind } from "@/lib/notification-kind";

/**
 * Delivery class. Drives:
 *   - whether quiet hours skip the push (silent skipped, alerting bypasses)
 *   - Web Push `urgency` header
 *   - APNs `apns-push-type` + `apns-priority`
 *   - FCM `android.priority` + `apns.headers.apns-priority`
 */
export type PushCategory = "alerting" | "silent";

export type PushCategoryMeta = {
  category: PushCategory;
  /** RFC 8030 Web Push urgency */
  urgency: "very-low" | "low" | "normal" | "high";
  /** APNs `apns-priority` (10 = immediate alert, 5 = deferred). */
  apnsPriority: 10 | 5;
  /** APNs `apns-push-type` ("alert" wakes device, "background" silent data). */
  apnsPushType: "alert" | "background";
  /** FCM Android priority. */
  fcmAndroidPriority: "HIGH" | "NORMAL";
};

const ALERTING: PushCategoryMeta = {
  category: "alerting",
  urgency: "high",
  apnsPriority: 10,
  apnsPushType: "alert",
  fcmAndroidPriority: "HIGH",
};

const SILENT: PushCategoryMeta = {
  category: "silent",
  urgency: "low",
  apnsPriority: 5,
  apnsPushType: "alert",
  fcmAndroidPriority: "NORMAL",
};

/**
 * Direct/critical interactions ring through quiet hours; passive social
 * signals collapse into the silent bucket and respect the user's window.
 */
export function pushCategoryFor(kind: NotificationKind): PushCategoryMeta {
  switch (kind) {
    case "message":
    case "message_request":
    case "mention":
    case "post_mention":
    case "story_mention":
    case "story_collab":
      return ALERTING;
    case "like":
    case "comment":
    case "follow":
    case "story":
    case "story_reaction":
    case "story_expiring":
    case "friend_joined":
      return SILENT;
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      return SILENT;
    }
  }
}
