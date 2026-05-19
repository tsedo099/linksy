import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getUser } from "@/lib/auth";
import { publishCallState } from "@/lib/call-signal-bus";
import { publishIncomingCall } from "@/lib/user-call-inbox-bus";
import {
  CALL_INIT_RATE_LIMIT,
  checkCallEligibility,
  isConversationParticipant,
  serializeCall,
} from "@/lib/calls";
import { logBackgroundError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { consumeRateLimit } from "@/lib/rate-limit";
import { parseRequestJson } from "@/lib/request-json";
import { callStartSchema } from "@/lib/schemas/api-bodies";

const HISTORY_LIMIT_DEFAULT = 50;
const HISTORY_LIMIT_MAX = 100;

/**
 * POST /api/calls — initiate an audio/video call in a conversation.
 *
 * Production gating:
 *   - 1:1 only (group calls return 501 — needs SFU)
 *   - blocks both ways via `areUsersBlocked`
 *   - rejects if recipient hasn't accepted the chat (message-request)
 *   - per-initiator rate limit (10/min)
 *   - alerting push notification to recipient (bypasses quiet hours)
 *   - audit log `CALL_INITIATED`
 */
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const limit = await consumeRateLimit("calls:init", me.userId, CALL_INIT_RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're starting calls too frequently. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = await parseRequestJson(req, callStartSchema);
  if (!parsed.ok) return parsed.response;
  const { conversationId, kind } = parsed.data;

  const eligibility = await checkCallEligibility(me.userId, conversationId);
  if (!eligibility.ok) {
    return NextResponse.json({ error: eligibility.error }, { status: eligibility.status });
  }

  // Reap stale "live" calls before checking for an active one. Without this,
  // a call where the user closed the tab / lost connection without clicking
  // End leaves a RINGING/ACCEPTED row behind, and every subsequent POST
  // returns 409 — the user is blocked from calling forever. Two clean-up
  // rules:
  //   1. Same initiator? They're clearly retrying — cancel the previous one.
  //   2. RINGING for longer than the ring timeout? No one's home — mark MISSED.
  // The remaining 409 case is a legitimate parallel call from the OTHER peer.
  const existing = await prisma.call.findFirst({
    where: { conversationId, status: { in: ["RINGING", "ACCEPTED"] } },
    select: { id: true, initiatorId: true, status: true, startedAt: true, acceptedAt: true },
  });
  if (existing) {
    const ageMs = Date.now() - existing.startedAt.getTime();
    const isStaleRinging = existing.status === "RINGING" && ageMs >= 45_000;
    const isSelfRetry = existing.initiatorId === me.userId;
    // ACCEPTED with no activity for >5min is almost certainly a dead
    // connection (user closed tab during call). Treat as "ended" so a
    // fresh call can start.
    const isAbandonedAccepted = existing.status === "ACCEPTED" && ageMs >= 5 * 60 * 1000;

    if (isSelfRetry || isStaleRinging || isAbandonedAccepted) {
      const nextStatus = isStaleRinging ? "MISSED" : isAbandonedAccepted ? "ENDED" : "CANCELLED";
      console.log(`[calls] auto-clearing stale call=${existing.id} status=${existing.status} -> ${nextStatus} (selfRetry=${isSelfRetry} ageMs=${ageMs})`);
      await prisma.call.update({
        where: { id: existing.id },
        data: { status: nextStatus, endedAt: new Date() },
      });
      publishCallState(existing.id, nextStatus);
    } else {
      return NextResponse.json(
        { error: "A call is already in progress for this conversation.", existingCallId: existing.id },
        { status: 409 },
      );
    }
  }

  const call = await prisma.call.create({
    data: { conversationId, initiatorId: me.userId, kind },
  });

  publishCallState(call.id, "RINGING");

  await writeAuditLog({
    action: "CALL_INITIATED",
    actorUserId: me.userId,
    targetType: "CALL",
    targetId: call.id,
    request: req,
    metadata: { conversationId, kind, recipientCount: eligibility.recipientIds.length },
  }).catch(logBackgroundError("calls.audit.initiated"));

  // Notify recipients with an alerting push (quiet-hours bypass).
  const initiator = await prisma.user.findUnique({
    where: { id: me.userId },
    select: { username: true, displayName: true, avatarUrl: true },
  });
  const fromLabel = initiator?.displayName?.trim() || initiator?.username || "Someone";
  const fromAvatarUrl = initiator?.avatarUrl ?? null;

  await Promise.allSettled(
    eligibility.recipientIds.map((userId) =>
      sendPushToUser({
        userId,
        kind: "message",
        title: kind === "VIDEO" ? `${fromLabel} is video calling` : `${fromLabel} is calling`,
        body: "Tap to answer.",
        url: `/messages?call=${call.id}`,
        tag: `call-${call.id}`,
      }).catch(logBackgroundError("calls.incomingPush")),
    ),
  );

  // In-app real-time signal: each recipient subscribed to /api/calls/inbox/stream
  // gets an event immediately so AppShell can pop the incoming-call surface
  // without depending on the web-push permission flow.
  const nowTs = Date.now();
  console.log(`[calls] publishing incoming to ${eligibility.recipientIds.length} recipients (callId=${call.id})`);
  for (const recipientUserId of eligibility.recipientIds) {
    publishIncomingCall({
      userId: recipientUserId,
      callId: call.id,
      fromUserId: me.userId,
      fromDisplayName: fromLabel,
      fromAvatarUrl,
      conversationId,
      kind,
      ts: nowTs,
    });
  }

  return NextResponse.json({ call: serializeCall(call) }, { status: 201 });
}

/**
 * GET /api/calls?conversationId=...&limit=50 — call history for a conversation
 * the viewer is a member of. Most-recent first.
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required." }, { status: 400 });
  }

  if (!(await isConversationParticipant(me.userId, conversationId))) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const requested = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(HISTORY_LIMIT_MAX, requested))
    : HISTORY_LIMIT_DEFAULT;

  const calls = await prisma.call.findMany({
    where: { conversationId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ calls: calls.map(serializeCall) });
}
