import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit-log";
import { getUser } from "@/lib/auth";
import { publishConversationMessageActivity } from "@/lib/conversation-message-bus";
import { logBackgroundError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { parseRequestJson } from "@/lib/request-json";
import { e2eeConversationFlagSchema } from "@/lib/schemas/api-bodies";

/**
 * PATCH /api/conversations/[id]/e2ee — toggle E2EE for a 1:1 conversation.
 *
 * Group convos are rejected (501): MLS-style group keying is out of scope.
 *
 * Enabling requires every member to have published an `E2EEIdentity` so the
 * sender can perform X3DH; otherwise we'd silently fall back to plaintext.
 *
 * Once enabled, server-side `POST /api/messages` rejects plaintext for this
 * conversation — the client must encrypt and send `ciphertext` + header.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { id: conversationId } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      isGroup: true,
      members: { select: { userId: true, isBlocked: true } },
    },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const meMember = conversation.members.find((m) => m.userId === me.userId);
  if (!meMember || meMember.isBlocked) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }
  if (conversation.isGroup) {
    return NextResponse.json(
      { error: "Group E2EE is not supported (needs MLS)." },
      { status: 501 },
    );
  }

  const parsed = await parseRequestJson(req, e2eeConversationFlagSchema);
  if (!parsed.ok) return parsed.response;
  const enabled = parsed.data.enabled;

  if (enabled) {
    const memberIds = conversation.members.map((m) => m.userId);
    const withKeys = await prisma.e2EEIdentity.count({
      where: { userId: { in: memberIds } },
    });
    if (withKeys < memberIds.length) {
      return NextResponse.json(
        { error: "All participants must publish E2EE keys first." },
        { status: 412 },
      );
    }
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { e2eeEnabled: enabled },
    select: { e2eeEnabled: true },
  });

  publishConversationMessageActivity(conversationId, "edit");

  await writeAuditLog({
    action: enabled ? "E2EE_ENABLED" : "E2EE_DISABLED",
    actorUserId: me.userId,
    targetType: "CONVERSATION",
    targetId: conversationId,
    request: req,
  }).catch(logBackgroundError("conversations.e2ee.audit"));

  return NextResponse.json({ e2eeEnabled: updated.e2eeEnabled });
}
