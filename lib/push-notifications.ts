import "server-only";
import { sendPushToUser } from "@/lib/push";
import type { NotificationKind } from "@/lib/notification-kind";

// Backward-compatible re-exports — new code should import from `@/lib/push` directly.
export { isWebPushConfigured, isFcmConfigured, isApnsConfigured } from "@/lib/push";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * Compat wrapper used before the multi-channel dispatcher landed. Routes web
 * push (and now FCM/APNs when env-configured) through `sendPushToUser` so
 * categories + quiet hours are applied uniformly.
 */
export async function sendWebPushToUser(userId: string, payload: PushPayload, kind: NotificationKind = "message") {
  await sendPushToUser({
    userId,
    kind,
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
  });
}
