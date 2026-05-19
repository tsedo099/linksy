import "server-only";
import webPush from "web-push";
import { logger } from "@/lib/logger";
import type { PushChannel, PushDeliveryPayload, PushDeliveryResult, PushSubscriptionRow } from "@/lib/push/types";

let configured = false;

function ensureVapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@linksy.local";
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webPush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return true;
}

export function isWebPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim(),
  );
}

export const webPushChannel: PushChannel = {
  platform: "WEB_PUSH",
  isConfigured: isWebPushConfigured,
  async send(target: PushSubscriptionRow, payload: PushDeliveryPayload): Promise<PushDeliveryResult> {
    if (!ensureVapid()) return { unregister: false };
    if (!target.endpoint || !target.p256dh || !target.auth) {
      // Bad row (mis-typed as WEB_PUSH without keys) — flag for cleanup.
      return { unregister: true };
    }

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? "/notifications",
      tag: payload.tag ?? "linksy",
      category: payload.category.category,
    });

    try {
      await webPush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        body,
        {
          TTL: payload.category.category === "alerting" ? 60 * 60 * 12 : 60 * 30,
          urgency: payload.category.urgency,
        },
      );
      return { unregister: false };
    } catch (err) {
      const code =
        typeof err === "object" && err && "statusCode" in err
          ? (err as { statusCode?: number }).statusCode
          : undefined;
      logger.warn(
        { scope: "push.web", userId: target.userId, statusCode: code, err: String(err) },
        "web push delivery failed",
      );
      return { unregister: code === 404 || code === 410 };
    }
  },
};
