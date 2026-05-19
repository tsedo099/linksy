import "server-only";
import { prisma } from "@/lib/prisma";
import { areUsersBlocked } from "@/lib/user-blocks";
import type { CallKind, CallStatus } from "@/lib/generated/prisma/client";

/** Server-side window after which an unanswered RINGING call is auto-marked MISSED. */
export const RING_TIMEOUT_MS = 45 * 1000;

/**
 * Defensive cap on a single ACCEPTED session. Cleanup cron flips runaway
 * sessions to ENDED so analytics + UI don't show "in progress" forever when
 * a client crashes without sending PATCH end.
 */
export const ACCEPTED_ZOMBIE_TIMEOUT_MS = 4 * 60 * 60 * 1000;

/** Per-user limit on POST /api/calls — anti-spam initiation. */
export const CALL_INIT_RATE_LIMIT = { windowMs: 60_000, max: 10 } as const;

/** Per-user limit on signaling POSTs — chatty by design but capped. */
export const CALL_SIGNAL_RATE_LIMIT = { windowMs: 60_000, max: 240 } as const;

export type CallSummary = {
  id: string;
  conversationId: string;
  initiatorId: string;
  kind: CallKind;
  status: CallStatus;
  startedAt: string;
  acceptedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  recordingUrl: string | null;
  recordingMimeType: string | null;
  recordingDurationSec: number | null;
  recordedById: string | null;
};

export function serializeCall(call: {
  id: string;
  conversationId: string;
  initiatorId: string;
  kind: CallKind;
  status: CallStatus;
  startedAt: Date;
  acceptedAt: Date | null;
  endedAt: Date | null;
  durationSec: number | null;
  recordingUrl?: string | null;
  recordingMimeType?: string | null;
  recordingDurationSec?: number | null;
  recordedById?: string | null;
}): CallSummary {
  return {
    id: call.id,
    conversationId: call.conversationId,
    initiatorId: call.initiatorId,
    kind: call.kind,
    status: call.status,
    startedAt: call.startedAt.toISOString(),
    acceptedAt: call.acceptedAt?.toISOString() ?? null,
    endedAt: call.endedAt?.toISOString() ?? null,
    durationSec: call.durationSec,
    recordingUrl: call.recordingUrl ?? null,
    recordingMimeType: call.recordingMimeType ?? null,
    recordingDurationSec: call.recordingDurationSec ?? null,
    recordedById: call.recordedById ?? null,
  };
}

/** Caller is a non-blocked member of the conversation. */
export async function isConversationParticipant(userId: string, conversationId: string): Promise<boolean> {
  const member = await prisma.conversationMember.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
    select: { isBlocked: true },
  });
  return Boolean(member && !member.isBlocked);
}

export type CallEligibility =
  | { ok: true; recipientIds: string[] }
  | { ok: false; status: number; error: string };

/**
 * Decide whether `initiatorId` may legitimately ring a 1:1 conversation:
 *
 *   - conversation must exist + initiator must be a non-blocked member
 *   - the **other** member must not be a pending message-request (recipient
 *     hasn't accepted the chat yet) and must not have blocked the initiator
 *   - group calls are rejected with 501 — needs SFU work to do safely at scale
 */
export async function checkCallEligibility(
  initiatorId: string,
  conversationId: string,
): Promise<CallEligibility> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      isGroup: true,
      members: {
        select: { userId: true, isBlocked: true, isRequest: true },
      },
    },
  });

  if (!conversation) return { ok: false, status: 404, error: "Conversation not found." };

  if (conversation.isGroup) {
    return {
      ok: false,
      status: 501,
      error: "Group calls require an SFU and are not yet supported.",
    };
  }

  const me = conversation.members.find((m) => m.userId === initiatorId);
  if (!me || me.isBlocked) return { ok: false, status: 404, error: "Conversation not found." };

  const others = conversation.members.filter((m) => m.userId !== initiatorId);
  if (others.length === 0) {
    return { ok: false, status: 400, error: "Conversation has no other members." };
  }

  const recipientIds: string[] = [];
  for (const other of others) {
    if (other.isBlocked || other.isRequest) {
      return {
        ok: false,
        status: 403,
        error: "The other person hasn't accepted your messages yet.",
      };
    }
    if (await areUsersBlocked(initiatorId, other.userId)) {
      return { ok: false, status: 403, error: "Call recipient is unavailable." };
    }
    recipientIds.push(other.userId);
  }

  return { ok: true, recipientIds };
}

/**
 * If a RINGING call has been waiting longer than RING_TIMEOUT_MS, transition
 * it to MISSED. Returns the (possibly updated) call. Cheap — runs lazily on
 * GET so we don't *require* the cleanup cron to be wired up; the cron just
 * makes sure peer state events fire even when no one is polling GET.
 */
export async function expireStaleRinging(call: {
  id: string;
  status: CallStatus;
  startedAt: Date;
}): Promise<{ status: CallStatus; endedAt: Date | null }> {
  if (call.status !== "RINGING") return { status: call.status, endedAt: null };
  if (Date.now() - call.startedAt.getTime() < RING_TIMEOUT_MS) {
    return { status: call.status, endedAt: null };
  }
  const endedAt = new Date();
  await prisma.call.update({
    where: { id: call.id },
    data: { status: "MISSED", endedAt },
  });
  return { status: "MISSED", endedAt };
}

function formatCallDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Render a one-line summary of a finished call, suitable as the body of a
 * Message row that lives in the conversation. Emoji prefix gives the chat
 * a visual call marker without needing a new message type column.
 */
export function callSummaryLine(call: {
  status: CallStatus;
  kind: CallKind;
  durationSec: number | null;
}): string {
  const icon = call.kind === "VIDEO" ? "📹" : "📞";
  switch (call.status) {
    case "ENDED":
      return `${icon} Call · ${formatCallDuration(call.durationSec)}`;
    case "DECLINED":
      return `${icon} Call declined`;
    case "CANCELLED":
      return `${icon} Call cancelled`;
    case "MISSED":
      return `${icon} Missed call`;
    case "RINGING":
    case "ACCEPTED":
      // Defensive — caller shouldn't pass live statuses, but if they do
      // we want a sensible string instead of "undefined".
      return `${icon} Call in progress`;
  }
}
