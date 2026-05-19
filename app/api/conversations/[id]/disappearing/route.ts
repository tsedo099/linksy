import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getUser } from "@/lib/auth";
import { publishConversationMessageActivity } from "@/lib/conversation-message-bus";
import { logBackgroundError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { disappearingPolicySchema } from "@/lib/schemas/api-bodies";

/**
 * PATCH /api/conversations/[id]/disappearing — set or clear the
 * disappearing-messages policy. Applies only to *future* messages: snapshots
 * already stamped on existing rows are preserved so retroactive policy changes
 * don't reschedule old messages.
 *
 * Body:
 *   `{ "mode": "OFF" }`
 *   `{ "mode": "TIMED",      "ttlSeconds": 3600 }`     // 1h after send
 *   `{ "mode": "AFTER_READ", "ttlSeconds": 60 }`        // 1m after first read
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId } = await params;

  const member = await prisma.conversationMember.findUnique({
    where: { userId_conversationId: { userId: me.userId, conversationId } },
    select: { isBlocked: true },
  });
  if (!member || member.isBlocked) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const parsed = await parseRequestJson(req, disappearingPolicySchema);
  if (!parsed.ok) return parsed.response;

  const mode = parsed.data.mode;
  const ttlSeconds = mode === "OFF" ? null : parsed.data.ttlSeconds ?? null;

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      disappearingMode: mode,
      disappearingSeconds: ttlSeconds,
    },
    select: { disappearingMode: true, disappearingSeconds: true },
  });

  publishConversationMessageActivity(conversationId, "edit");

  await writeAuditLog({
    action: "DISAPPEARING_MESSAGES_UPDATED",
    actorUserId: me.userId,
    targetType: "CONVERSATION",
    targetId: conversationId,
    request: req,
    metadata: { mode, ttlSeconds },
  }).catch(logBackgroundError("conversations.disappearing.audit"));

  return NextResponse.json({
    disappearing: {
      mode: updated.disappearingMode,
      ttlSeconds: updated.disappearingSeconds,
    },
  });
}
