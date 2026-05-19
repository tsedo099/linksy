import { NextRequest, NextResponse } from "next/server";
import { publishConversationMessageActivity } from "@/lib/conversation-message-bus";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_SIZE = 500;

/**
 * Hard-deletes Message rows whose `expiresAt` has passed (TIMED + AFTER_READ
 * disappearing messages). Publishes a `delete` event per affected
 * conversation so live UIs refetch and drop the rows immediately.
 *
 * Run every minute in production:
 *   `* * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *      https://app.example.com/api/cron/messages-cleanup`
 *
 * The GET handler in /api/conversations/[id] already filters `expiresAt > now`
 * on read, so a slow cron only delays *physical* row removal — never
 * exposes expired text to the recipient.
 */
async function handle(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const expired = await prisma.message.findMany({
    where: { expiresAt: { lte: now } },
    select: { id: true, conversationId: true },
    take: BATCH_SIZE,
  });

  if (expired.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, timestamp: now.toISOString() });
  }

  const ids = expired.map((row) => row.id);
  const result = await prisma.message.deleteMany({ where: { id: { in: ids } } });

  const seen = new Set<string>();
  for (const row of expired) {
    if (seen.has(row.conversationId)) continue;
    seen.add(row.conversationId);
    publishConversationMessageActivity(row.conversationId, "delete");
  }

  return NextResponse.json({
    ok: true,
    deleted: result.count,
    conversationsTouched: seen.size,
    batched: expired.length === BATCH_SIZE,
    timestamp: now.toISOString(),
  });
}

export const GET = handle;
export const POST = handle;
