import { prisma } from "@/lib/prisma";
import { localizedGroupedReactionPushPreview, localizedPushPreview } from "@/lib/i18n/push-translations";
import { parseAppLanguage } from "@/lib/language";
import { NotificationType, Prisma } from "@/lib/generated/prisma/client";
import { publishNotificationEvent } from "@/lib/notification-bus";
import { sendPushToUser } from "@/lib/push";
import { shouldDeliverNotification } from "@/lib/notification-rules";

export type { NotificationKind } from "@/lib/notification-kind";
import type { NotificationKind } from "@/lib/notification-kind";

export type NotificationPrefs = {
  like: boolean;
  comment: boolean;
  follow: boolean;
  mention: boolean;
  story: boolean;
  message: boolean;
  friendJoined: boolean;
};

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  like: true,
  comment: true,
  follow: true,
  mention: true,
  story: true,
  message: true,
  friendJoined: true,
};

export const EMAIL_DIGEST_CADENCES = ["off", "daily", "weekly"] as const;
export type EmailDigestCadence = (typeof EMAIL_DIGEST_CADENCES)[number];
export const DEFAULT_EMAIL_DIGEST: EmailDigestCadence = "off";

export function isEmailDigestCadence(value: unknown): value is EmailDigestCadence {
  return typeof value === "string" && (EMAIL_DIGEST_CADENCES as readonly string[]).includes(value);
}

export function cadenceToDb(value: EmailDigestCadence): "OFF" | "DAILY" | "WEEKLY" {
  if (value === "daily") return "DAILY";
  if (value === "weekly") return "WEEKLY";
  return "OFF";
}

export function cadenceFromDb(value: string | null | undefined): EmailDigestCadence {
  if (value === "DAILY") return "daily";
  if (value === "WEEKLY") return "weekly";
  return "off";
}

export function normalizeNotificationPrefs(value: unknown): NotificationPrefs {
  if (!value || typeof value !== "object") return { ...DEFAULT_NOTIFICATION_PREFS };
  const source = value as Record<string, unknown>;
  const out: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
  for (const key of Object.keys(out) as (keyof NotificationPrefs)[]) {
    if (typeof source[key] === "boolean") out[key] = source[key] as boolean;
  }
  return out;
}

function isMissingPrefsColumn(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return String(error.meta?.column ?? error.message ?? "").includes("notificationPrefs");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("notificationPrefs");
}

function isMissingDigestColumn(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return String(error.meta?.column ?? error.message ?? "").includes("emailDigest");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("emailDigest");
}

async function getRecipientPrefs(userId: string): Promise<NotificationPrefs> {
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPrefs: true },
    });
    return normalizeNotificationPrefs(row?.notificationPrefs);
  } catch (error) {
    if (isMissingPrefsColumn(error)) return { ...DEFAULT_NOTIFICATION_PREFS };
    throw error;
  }
}

export async function loadNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  return getRecipientPrefs(userId);
}

export async function loadDigestPreference(userId: string): Promise<{
  cadence: EmailDigestCadence;
  lastSentAt: Date | null;
}> {
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailDigest: true, digestLastSentAt: true },
    });
    return {
      cadence: cadenceFromDb(row?.emailDigest as unknown as string | null),
      lastSentAt: row?.digestLastSentAt ?? null,
    };
  } catch (error) {
    if (isMissingDigestColumn(error)) return { cadence: DEFAULT_EMAIL_DIGEST, lastSentAt: null };
    throw error;
  }
}

export async function saveDigestPreference(userId: string, cadence: EmailDigestCadence) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { emailDigest: cadenceToDb(cadence) as never },
    });
  } catch (error) {
    if (isMissingDigestColumn(error)) {
      throw new Error("Email digest column is not migrated yet.");
    }
    throw error;
  }
  return cadence;
}

export async function saveNotificationPrefs(userId: string, prefs: NotificationPrefs): Promise<NotificationPrefs> {
  const sanitized = normalizeNotificationPrefs(prefs);
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { notificationPrefs: sanitized as unknown as Prisma.InputJsonValue },
    });
  } catch (error) {
    if (isMissingPrefsColumn(error)) {
      throw new Error("Notification preferences column is not migrated yet.");
    }
    throw error;
  }
  return sanitized;
}

export type CreateNotificationInput = {
  userId: string;
  fromId: string;
  type: NotificationKind;
  postId?: string | null;
  storyId?: string | null;
};

function prefKeyFor(kind: NotificationKind): keyof NotificationPrefs {
  if (kind === "story_reaction" || kind === "story_collab" || kind === "story_expiring") return "story";
  if (kind === "message_request") return "message";
  if (kind === "friend_joined") return "friendJoined";
  if (kind === "post_mention" || kind === "story_mention" || kind === "mention") return "mention";
  return kind as keyof NotificationPrefs;
}

const REACTION_GROUP_WINDOW_MS = 48 * 60 * 60 * 1000;
const MAX_STORED_PEER_IDS = 32;

function isMergeablePostReaction(kind: NotificationKind): kind is "like" | "comment" {
  return kind === "like" || kind === "comment";
}

async function createOrMergeNotificationRow(input: CreateNotificationInput, dbType: NotificationType) {
  if (!isMergeablePostReaction(input.type) || !input.postId) {
    return prisma.notification.create({
      data: {
        userId: input.userId,
        fromId: input.fromId,
        type: dbType,
        postId: input.postId ?? null,
        storyId: input.storyId ?? null,
      },
    });
  }

  return prisma.$transaction(async (tx) => {
    const cutoff = new Date(Date.now() - REACTION_GROUP_WINDOW_MS);
    const existing = await tx.notification.findFirst({
      where: {
        userId: input.userId,
        type: dbType,
        postId: input.postId!,
        read: false,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing && existing.fromId !== input.fromId) {
      const chain = [existing.fromId, ...existing.groupPeerIds];
      const deduped: string[] = [];
      for (const id of chain) {
        if (id !== input.fromId && !deduped.includes(id)) deduped.push(id);
      }
      const trimmed = deduped.slice(0, MAX_STORED_PEER_IDS);
      return tx.notification.update({
        where: { id: existing.id },
        data: {
          fromId: input.fromId,
          groupPeerIds: trimmed,
          groupCount: existing.groupCount + 1,
          createdAt: new Date(),
          read: false,
        },
      });
    }

    return tx.notification.create({
      data: {
        userId: input.userId,
        fromId: input.fromId,
        type: dbType,
        postId: input.postId ?? null,
        storyId: input.storyId ?? null,
      },
    });
  });
}

/**
 * Creates a Notification row only if the recipient has the matching preference enabled.
 * Returns the created notification, or null if it was skipped.
 */
export async function createNotificationIfAllowed(input: CreateNotificationInput) {
  const allowSelf = input.type === "story_expiring";
  if (!allowSelf && input.userId === input.fromId) return null;

  let recipient: { notificationPrefs: unknown; preferredLanguage: string | null } | null = null;
  try {
    recipient = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { notificationPrefs: true, preferredLanguage: true },
    });
  } catch (error) {
    if (isMissingPrefsColumn(error)) recipient = null;
    else throw error;
  }

  const prefs = normalizeNotificationPrefs(recipient?.notificationPrefs);
  const prefKey = prefKeyFor(input.type);
  if (!prefs[prefKey]) return null;

  const dbType = input.type as NotificationType;
  if (!(await shouldDeliverNotification(input.userId, input.fromId, dbType, input.postId))) {
    return null;
  }

  const saved = await createOrMergeNotificationRow(input, dbType);

  const actor = await prisma.user.findUnique({
    where: { id: input.fromId },
    select: { username: true, displayName: true },
  });
  const fromLabel = actor?.displayName?.trim() || actor?.username || "Someone";
  const lang = parseAppLanguage(recipient?.preferredLanguage);
  let title: string;
  let body: string;
  if (isMergeablePostReaction(input.type) && saved.groupCount > 1) {
    ({ title, body } = localizedGroupedReactionPushPreview(
      input.type,
      fromLabel,
      saved.groupCount,
      lang,
    ));
  } else {
    ({ title, body } = localizedPushPreview(input.type, fromLabel, lang));
  }
  const url = input.storyId
    ? `/story/${input.storyId}`
    : input.postId
      ? `/post/${input.postId}`
      : input.type === "message_request"
        ? "/messages"
        : "/notifications";
  publishNotificationEvent(input.userId, "created");

  const pushTag =
    input.postId && isMergeablePostReaction(input.type)
      ? `n-${input.type}-${input.postId}`
      : `n-${saved.id}`;

  sendPushToUser({
    userId: input.userId,
    kind: input.type,
    title,
    body,
    url,
    tag: pushTag,
  }).catch(() => undefined);

  return saved;
}

/** After accepting a DM request, clear unread `message_request` rows from that sender (bell + SSE). */
export async function markMessageRequestNotificationsReadForSender(input: {
  recipientUserId: string;
  senderUserId: string;
}) {
  const result = await prisma.notification.updateMany({
    where: {
      userId: input.recipientUserId,
      fromId: input.senderUserId,
      type: NotificationType.message_request,
      read: false,
    },
    data: { read: true },
  });
  if (result.count > 0) publishNotificationEvent(input.recipientUserId, "read");
  return result.count;
}
