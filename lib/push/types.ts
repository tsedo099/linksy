import "server-only";
import type { PushPlatform } from "@/lib/generated/prisma/client";
import type { PushCategoryMeta } from "@/lib/push/categories";

export type PushDeliveryPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  category: PushCategoryMeta;
};

export type PushSubscriptionRow = {
  id: string;
  userId: string;
  platform: PushPlatform;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  deviceToken: string | null;
};

export type PushDeliveryResult = {
  /** Endpoint/token is permanently dead and should be removed from the DB. */
  unregister: boolean;
};

export interface PushChannel {
  readonly platform: PushPlatform;
  isConfigured(): boolean;
  send(target: PushSubscriptionRow, payload: PushDeliveryPayload): Promise<PushDeliveryResult>;
}
