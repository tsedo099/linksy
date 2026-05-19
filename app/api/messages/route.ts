import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { Prisma } from "@/lib/generated/prisma/client";
import { randomUUID } from "crypto";
import { isAudioMediaUrl, isUploadedMediaUrl, isVideoMediaUrl } from "@/lib/media";
import { parseRequestJson } from "@/lib/request-json";
import { messageCreateSchema } from "@/lib/schemas/api-bodies";
import { sanitizePlainText } from "@/lib/sanitize-html";
import { publishConversationMessageActivity } from "@/lib/conversation-message-bus";
import { expiryForNewMessage } from "@/lib/disappearing-messages";
import type { DisappearingMode } from "@/lib/generated/prisma/client";
import { messagesSentTotal } from "@/lib/metrics";
import { trackActiveUser } from "@/lib/active-users";
import { withMetrics } from "@/lib/with-metrics";
import { scoreAdultContent } from "@/lib/adult-content";
import { checkUserCanSendAdult } from "@/lib/age-gate";

function isMissingMessageReadAt(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === "P2022"
    && String(error.meta?.modelName ?? "").includes("Message");
}

function isMissingMessageMediaUrl(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("Unknown argument `mediaUrl`") || message.includes("Unknown field `mediaUrl`");
}

function isMissingMessageReplyTo(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
    return String(error.meta?.column ?? error.message ?? "").includes("replyToId");
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("Unknown argument `replyToId`")
    || message.includes("Unknown field `replyToId`")
    || message.includes("replyToId");
}

const REPLY_PREVIEW_MAX = 140;
function buildReplyPreview(text: string | null | undefined, mediaUrl: string | null | undefined) {
  const trimmed = (text ?? "").trim();
  if (trimmed) return trimmed.slice(0, REPLY_PREVIEW_MAX);
  if (mediaUrl) return isVideoMediaUrl(mediaUrl) ? "Video" : "Photo";
  return "";
}

// POST /api/messages - send a message
export const POST = withMetrics("/api/messages", async (req: NextRequest) => {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, messageCreateSchema);
  if (!parsed.ok) return parsed.response;

  const {
    conversationId,
    text,
    mediaUrl: rawMediaUrl,
    replyToId: rawReply,
    ciphertext,
    ciphertextHeader,
    encryptedKind,
    containsAdultContent: senderAdultFlag,
  } = parsed.data;
  const mediaUrl = rawMediaUrl?.trim() || undefined;
  let trimmedText = sanitizePlainText((text ?? "").trim());
  const rawReplyToId = typeof rawReply === "string" ? rawReply.trim() : "";
  let replyToId: string | null = rawReplyToId.length > 0 ? rawReplyToId : null;
  const hasCiphertext = Boolean(ciphertext && ciphertextHeader && encryptedKind);

  if (!conversationId) {
    return NextResponse.json({ error: "Conversation ID is required." }, { status: 400 });
  }

  if (!hasCiphertext && !trimmedText && !mediaUrl) {
    return NextResponse.json({ error: "Message text or media is required." }, { status: 400 });
  }

  if (trimmedText.length > 2000) {
    return NextResponse.json({ error: "Message must be 2000 characters or less." }, { status: 400 });
  }
  if (mediaUrl && !isUploadedMediaUrl(mediaUrl)) {
    return NextResponse.json({ error: "Message media must be uploaded through Linksy." }, { status: 400 });
  }
  if (mediaUrl && mediaUrl.length > 1200) {
    return NextResponse.json({ error: "Message media URL is too long." }, { status: 400 });
  }
  if (mediaUrl) {
    const stripped = mediaUrl.split("#")[0] ?? mediaUrl;
    const isImageExt = /\.(jpe?g|png|webp|gif)(?:[?].*)?$/i.test(stripped);
    const isVideoExt = /\.(mp4|mov|webm|m4v)(?:[?].*)?$/i.test(stripped);
    const isAudioExt = /\.(mp3|m4a|aac|wav|oga|ogg)(?:[?].*)?$/i.test(stripped);
    const isVoiceMessage = isAudioMediaUrl(mediaUrl);
    if (!isImageExt && !isVideoExt && !isAudioExt && !isVideoMediaUrl(mediaUrl) && !isVoiceMessage) {
      return NextResponse.json({ error: "Only image, video, or voice media is allowed." }, { status: 400 });
    }
  }

  const member = await prisma.conversationMember.findUnique({
    where: { userId_conversationId: { userId: me.userId, conversationId } },
  });
  if (!member) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (member.isRequest) {
    return NextResponse.json({ error: "Accept the message request first." }, { status: 403 });
  }

  const blockedIds = await getBlockedUserIds(me.userId);
  if (blockedIds.length > 0) {
    const blockedMember = await prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId: { in: blockedIds },
      },
      select: { userId: true },
    });
    if (blockedMember) {
      return NextResponse.json({ error: "You cannot message this conversation." }, { status: 403 });
    }
  }

  try {
    const otherBlocking = await prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId: { not: me.userId },
        isBlocked: true,
      },
      select: { userId: true },
    });
    if (otherBlocking) {
      return NextResponse.json({ error: "Recipient has blocked this conversation." }, { status: 403 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const missingColumn = error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2022"
      && String(error.meta?.column ?? "").includes("isBlocked");
    if (!missingColumn && !message.includes("isBlocked")) throw error;
    // column not migrated yet — skip per-conversation block check
  }

  let replyToPreview: { messageId: string; senderName: string; preview: string } | null = null;
  if (replyToId) {
    const target = await prisma.message.findUnique({
      where: { id: replyToId },
      select: {
        id: true,
        conversationId: true,
        text: true,
        mediaUrl: true,
        deletedAt: true,
        sender: { select: { displayName: true } },
      },
    });
    if (!target || target.conversationId !== conversationId || target.deletedAt) {
      replyToId = null;
    } else {
      replyToPreview = {
        messageId: target.id,
        senderName: target.sender.displayName,
        preview: buildReplyPreview(target.text, target.mediaUrl),
      };
    }
  }

  // Apply the conversation's disappearing-messages policy to this row. The
  // snapshot fields (`expirePolicy/expireAfterSeconds`) are copied so changing
  // the convo policy later doesn't reschedule already-sent messages.
  let convoPolicy: {
    disappearingMode: DisappearingMode;
    disappearingSeconds: number | null;
    e2eeEnabled: boolean;
  } = {
    disappearingMode: "OFF",
    disappearingSeconds: null,
    e2eeEnabled: false,
  };
  try {
    const policyRow = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { disappearingMode: true, disappearingSeconds: true, e2eeEnabled: true },
    });
    if (policyRow) convoPolicy = policyRow;
  } catch (error) {
    // Tolerate: column not yet migrated → fall back to OFF.
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022")
      && !(error instanceof Error && error.message.includes("disappearingMode"))
      && !(error instanceof Error && error.message.includes("e2eeEnabled"))
    ) throw error;
  }

  // Enforce the conversation's E2EE policy:
  //   - When E2EE is on, the message body must arrive encrypted. Plaintext
  //     `text` is stripped server-side so it never lands in storage even if
  //     the client accidentally included a draft.
  //   - Media is allowed when (and only when) the sender pre-encrypted the
  //     bytes client-side (see `lib/e2ee/media.ts`) and the key/iv to decrypt
  //     ride inside the E2EE message body. The server never sees plaintext
  //     bytes; `mediaUrl` here points at the ciphertext blob the client
  //     uploaded.
  if (convoPolicy.e2eeEnabled) {
    if (!hasCiphertext) {
      return NextResponse.json(
        { error: "This conversation requires end-to-end encrypted messages." },
        { status: 400 },
      );
    }
    trimmedText = "";
    // Reply previews can't be rendered server-side either, so suppress.
    replyToId = null;
  } else if (hasCiphertext) {
    return NextResponse.json(
      { error: "End-to-end encryption is not enabled for this conversation." },
      { status: 400 },
    );
  }

  const expiry = expiryForNewMessage({
    mode: convoPolicy.disappearingMode,
    ttlSeconds: convoPolicy.disappearingSeconds,
    createdAt: new Date(),
  });

  // Adult-content gate: sender's toggle OR the keyword scorer in
  // `lib/adult-content.ts`. We OR the two so a missed composer toggle still
  // trips the recipient-side gate. For E2EE conversations the body is
  // ciphertext, so the scorer's text input would always be empty — fall back
  // to the sender's explicit flag only.
  const adultScored = hasCiphertext ? null : scoreAdultContent(trimmedText);
  const containsAdultContent =
    senderAdultFlag === true || (adultScored?.flagged ?? false);

  // Under-18 senders are blocked outright. Same rule as posts/stories: it
  // doesn't matter whether the flag came from the explicit toggle or the
  // server-side scorer — under-18 cannot publish adult content anywhere.
  if (containsAdultContent) {
    const gate = await checkUserCanSendAdult(me.userId);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.message, reason: gate.reason },
        { status: 403 },
      );
    }
  }

  const baseMessageData: {
    conversationId: string;
    senderId: string;
    text: string;
    mediaUrl?: string;
    replyToId?: string;
    expirePolicy?: DisappearingMode;
    expireAfterSeconds?: number;
    expiresAt?: Date;
    ciphertext?: string;
    ciphertextHeader?: string;
    encryptedKind?: string;
    containsAdultContent?: boolean;
  } = {
    conversationId,
    senderId: me.userId,
    text: trimmedText,
  };
  if (mediaUrl) baseMessageData.mediaUrl = mediaUrl;
  if (replyToId) baseMessageData.replyToId = replyToId;
  if (expiry.expirePolicy) baseMessageData.expirePolicy = expiry.expirePolicy;
  if (expiry.expireAfterSeconds != null) baseMessageData.expireAfterSeconds = expiry.expireAfterSeconds;
  if (expiry.expiresAt) baseMessageData.expiresAt = expiry.expiresAt;
  if (hasCiphertext) {
    baseMessageData.ciphertext = ciphertext;
    baseMessageData.ciphertextHeader = ciphertextHeader;
    baseMessageData.encryptedKind = encryptedKind;
  }
  if (containsAdultContent) baseMessageData.containsAdultContent = true;

  let message;
  try {
    [message] = await prisma.$transaction([
      prisma.message.create({
        data: baseMessageData,
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
  } catch (error) {
    if (isMissingMessageReplyTo(error) && replyToId) {
      replyToId = null;
      replyToPreview = null;
      delete baseMessageData.replyToId;
      [message] = await prisma.$transaction([
        prisma.message.create({
          data: baseMessageData,
          include: {
            sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        }),
        prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        }),
      ]);
      publishConversationMessageActivity(conversationId, "message");
      return NextResponse.json({ message: { ...message, replyTo: null } }, { status: 201 });
    }

    if (isMissingMessageMediaUrl(error)) {
      if (mediaUrl) {
        return NextResponse.json(
          { error: "Message media is temporarily unavailable. Please retry once the server finishes reloading." },
          { status: 503 },
        );
      }
      [message] = await prisma.$transaction([
        prisma.message.create({
          data: { conversationId, senderId: me.userId, text: trimmedText, ...(replyToId ? { replyToId } : {}) },
          include: {
            sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        }),
        prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        }),
      ]);
      publishConversationMessageActivity(conversationId, "message");
      return NextResponse.json({ message: { ...message, replyTo: replyToPreview } }, { status: 201 });
    }

    if (!isMissingMessageReadAt(error)) throw error;

    message = await prisma.$transaction(async (tx) => {
      const messageId = randomUUID();
      const createdAt = new Date();
      const inserted = await tx.$queryRaw<Array<{
        id: string;
        senderId: string;
        conversationId: string;
        text: string;
        mediaUrl: string | null;
        read: boolean;
        createdAt: Date;
        replyToId: string | null;
      }>>(Prisma.sql`
        INSERT INTO "Message" ("id", "conversationId", "senderId", "text", "mediaUrl", "read", "createdAt", "replyToId")
        VALUES (${messageId}, ${conversationId}, ${me.userId}, ${trimmedText}, ${mediaUrl ?? null}, false, ${createdAt}, ${replyToId})
        RETURNING "id", "senderId", "conversationId", "text", "mediaUrl", "read", "createdAt", "replyToId"
      `);

      const row = inserted[0];
      if (!row) {
        throw new Error("Could not create message.");
      }

      const sender = await tx.user.findUnique({
        where: { id: me.userId },
        select: { id: true, username: true, displayName: true, avatarUrl: true },
      });
      if (!sender) {
        throw new Error("Sender not found.");
      }

      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      return {
        ...row,
        sender,
      };
    });
  }

  publishConversationMessageActivity(conversationId, "message");

  // Business metrics: count every successful send, distinguishing DM vs group
  // so the rollup matches the product funnel. Active-user tracker fires here
  // too because "sent a message" is a strong engagement signal for DAU/MAU.
  try {
    const convoKind = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { isGroup: true },
    });
    messagesSentTotal.inc({ conversation_kind: convoKind?.isGroup ? "group" : "dm" });
  } catch {
    messagesSentTotal.inc({ conversation_kind: "dm" });
  }
  void trackActiveUser(me.userId);

  return NextResponse.json({ message: { ...message, replyTo: replyToPreview } }, { status: 201 });
});
