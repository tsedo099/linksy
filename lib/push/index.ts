import "server-only";
import { prisma } from "@/lib/prisma";
import { apnsChannel } from "@/lib/push/apns";
import { fcmChannel } from "@/lib/push/fcm";
import { webPushChannel } from "@/lib/push/web-push";
import { pushCategoryFor } from "@/lib/push/categories";
import { isInQuietHours, parseQuietHours } from "@/lib/push/quiet-hours";
import type { PushChannel, PushDeliveryPayload, PushSubscriptionRow } from "@/lib/push/types";
import type { NotificationKind } from "@/lib/notification-kind";
import type { PushPlatform } from "@/lib/generated/prisma/client";

export { isWebPushConfigured } from "@/lib/push/web-push";
export { isFcmConfigured } from "@/lib/push/fcm";
export { isApnsConfigured } from "@/lib/push/apns";

const CHANNELS: Record<PushPlatform, PushChannel> = {
  WEB_PUSH: webPushChannel,
  FCM: fcmChannel,
  APNS: apnsChannel,
};

export type SendPushInput = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * Fan out a notification to every push subscription the user owns, after
 * applying category mapping (silent vs alerting) and quiet-hours gating.
 *
 * Silent pushes inside the user's quiet-hours window are dropped; alerting
 * pushes (DMs, mentions, story collab) always go through.
 */
export async function sendPushToUser(input: SendPushInput): Promise<void> {
  const category = pushCategoryFor(input.kind);

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      quietHoursStart: true,
      quietHoursEnd: true,
      quietHoursTimezone: true,
    },
  });

  if (category.category === "silent" && user) {
    const window = parseQuietHours(user);
    if (window && isInQuietHours(window)) return;
  }

  const subscriptions = (await prisma.pushSubscription.findMany({
    where: { userId: input.userId },
    select: {
      id: true,
      userId: true,
      platform: true,
      endpoint: true,
      p256dh: true,
      auth: true,
      deviceToken: true,
    },
  })) as PushSubscriptionRow[];

  if (subscriptions.length === 0) return;

  const payload: PushDeliveryPayload = {
    title: input.title,
    body: input.body,
    url: input.url,
    tag: input.tag,
    category,
  };

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const channel = CHANNELS[sub.platform];
      if (!channel.isConfigured()) return;
      const { unregister } = await channel.send(sub, payload);
      if (unregister) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      }
    }),
  );
}
