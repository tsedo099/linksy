import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getUser } from "@/lib/auth";
import { publishCallState } from "@/lib/call-signal-bus";
import { callSummaryLine, expireStaleRinging, isConversationParticipant, serializeCall } from "@/lib/calls";
import { publishConversationMessageActivity } from "@/lib/conversation-message-bus";
import { logBackgroundError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { callActionSchema } from "@/lib/schemas/api-bodies";
import type { CallStatus } from "@/lib/generated/prisma/client";

const TERMINAL_STATUSES: CallStatus[] = ["ENDED", "DECLINED", "CANCELLED", "MISSED"];

/**
 * Post a system-style message into the conversation summarizing how the
 * call finished. The sender is the initiator so both parties see one row,
 * and inbox previews show e.g. "📞 Missed call" / "📹 Call · 2:34". Best-
 * effort: failures are logged but do not bubble out — the call PATCH must
 * not 500 just because the chat insert hiccupped.
 */
async function recordCallInChat(call: {
  id: string;
  conversationId: string;
  initiatorId: string;
  status: CallStatus;
  kind: "AUDIO" | "VIDEO";
  durationSec: number | null;
}): Promise<void> {
  if (!TERMINAL_STATUSES.includes(call.status)) return;
  try {
    await prisma.message.create({
      data: {
        senderId: call.initiatorId,
        conversationId: call.conversationId,
        text: callSummaryLine(call),
      },
    });
    publishConversationMessageActivity(call.conversationId, "message");
  } catch (err) {
    logBackgroundError("calls.chatSummary")(err);
  }
}

async function loadCallForViewer(callId: string, userId: string) {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call) return null;
  if (!(await isConversationParticipant(userId, call.conversationId))) return null;
  return call;
}

/** GET /api/calls/[id] — current state (auto-expires stale RINGING). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const call = await loadCallForViewer(id, me.userId);
  if (!call) return NextResponse.json({ error: "Call not found." }, { status: 404 });

  const expiry = await expireStaleRinging(call);
  if (expiry.status !== call.status) {
    publishCallState(call.id, expiry.status);
  }
  return NextResponse.json({
    call: serializeCall({
      ...call,
      status: expiry.status,
      endedAt: expiry.endedAt ?? call.endedAt,
    }),
  });
}

/** PATCH /api/calls/[id] — accept / decline / cancel / end. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id } = await params;
  const call = await loadCallForViewer(id, me.userId);
  if (!call) return NextResponse.json({ error: "Call not found." }, { status: 404 });

  const parsed = await parseRequestJson(req, callActionSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const { action } = body;

  // Recording attach is a separate flow — no lifecycle change.
  if (action === "attach-recording") {
    if (call.status !== "ACCEPTED" && call.status !== "ENDED") {
      return NextResponse.json({ error: `Cannot attach recording to a ${call.status} call.` }, { status: 409 });
    }
    const recording = body;
    const updated = await prisma.call.update({
      where: { id: call.id },
      data: {
        recordingUrl: recording.recordingUrl,
        recordingMimeType: recording.recordingMimeType,
        recordingDurationSec: recording.recordingDurationSec,
        recordedById: me.userId,
      },
    });
    await writeAuditLog({
      action: "CALL_RECORDING_ATTACHED",
      actorUserId: me.userId,
      targetType: "CALL",
      targetId: updated.id,
      request: req,
      metadata: {
        conversationId: updated.conversationId,
        recordingMimeType: updated.recordingMimeType,
        recordingDurationSec: updated.recordingDurationSec,
      },
    }).catch(logBackgroundError("calls.audit.recording-attached"));
    return NextResponse.json({ call: serializeCall(updated) });
  }

  const isInitiator = call.initiatorId === me.userId;
  const now = new Date();

  let nextStatus: CallStatus = call.status;
  let acceptedAt: Date | null = call.acceptedAt;
  let endedAt: Date | null = call.endedAt;
  let durationSec: number | null = call.durationSec;

  if (action === "accept") {
    if (isInitiator) return NextResponse.json({ error: "Initiator cannot accept their own call." }, { status: 400 });
    if (call.status !== "RINGING") {
      return NextResponse.json({ error: `Cannot accept a call in ${call.status} state.` }, { status: 409 });
    }
    nextStatus = "ACCEPTED";
    acceptedAt = now;
  } else if (action === "decline") {
    if (isInitiator) return NextResponse.json({ error: "Initiator cannot decline their own call." }, { status: 400 });
    if (call.status !== "RINGING") {
      return NextResponse.json({ error: `Cannot decline a call in ${call.status} state.` }, { status: 409 });
    }
    nextStatus = "DECLINED";
    endedAt = now;
  } else if (action === "cancel") {
    if (!isInitiator) return NextResponse.json({ error: "Only the initiator can cancel." }, { status: 403 });
    if (call.status !== "RINGING") {
      return NextResponse.json({ error: `Cannot cancel a call in ${call.status} state.` }, { status: 409 });
    }
    nextStatus = "CANCELLED";
    endedAt = now;
  } else if (action === "end") {
    if (call.status !== "ACCEPTED") {
      return NextResponse.json({ error: `Cannot end a call in ${call.status} state.` }, { status: 409 });
    }
    nextStatus = "ENDED";
    endedAt = now;
    if (call.acceptedAt) {
      durationSec = Math.max(0, Math.floor((now.getTime() - call.acceptedAt.getTime()) / 1000));
    }
  }

  const updated = await prisma.call.update({
    where: { id: call.id },
    data: { status: nextStatus, acceptedAt, endedAt, durationSec },
  });

  publishCallState(updated.id, updated.status);

  // Post a "📞 Missed call" / "📹 Call · 2:34" message into the chat so the
  // conversation history shows the call. Fire-and-forget; never blocks the
  // PATCH response.
  void recordCallInChat({
    id: updated.id,
    conversationId: updated.conversationId,
    initiatorId: updated.initiatorId,
    status: updated.status,
    kind: updated.kind,
    durationSec: updated.durationSec,
  });

  await writeAuditLog({
    action: `CALL_${updated.status}`,
    actorUserId: me.userId,
    targetType: "CALL",
    targetId: updated.id,
    request: req,
    metadata: {
      conversationId: updated.conversationId,
      durationSec: updated.durationSec,
      role: isInitiator ? "initiator" : "recipient",
    },
  }).catch(logBackgroundError(`calls.audit.${updated.status}`));

  return NextResponse.json({ call: serializeCall(updated) });
}
