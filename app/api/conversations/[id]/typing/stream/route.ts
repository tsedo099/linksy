import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { getTypingBus, type TypingEvent } from "@/lib/typing-bus";
import { isShuttingDown, registerShutdownCloser } from "@/lib/shutdown";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;

// GET /api/conversations/[id]/typing/stream - SSE stream of typing events
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getUser(req);
  if (!me) return new Response("Not authenticated.", { status: 401 });

  const { id: conversationId } = await params;

  const member = await prisma.conversationMember.findUnique({
    where: { userId_conversationId: { userId: me.userId, conversationId } },
  });
  if (!member) return new Response("Forbidden.", { status: 403 });
  if (member.isRequest) return new Response("Accept the message request first.", { status: 403 });

  const blockedIds = await getBlockedUserIds(me.userId);
  if (blockedIds.length > 0) {
    const blockedMember = await prisma.conversationMember.findFirst({
      where: { conversationId, userId: { in: blockedIds } },
      select: { userId: true },
    });
    if (blockedMember) return new Response("Conversation unavailable.", { status: 403 });
  }

  if (isShuttingDown()) {
    return new Response("Server draining.", {
      status: 503,
      headers: { "Retry-After": "5" },
    });
  }

  const bus = getTypingBus();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { closed = true; }
      };

      safeEnqueue(`retry: 3000\n\n`);
      safeEnqueue(`event: ready\ndata: {}\n\n`);

      const unsubscribe = bus.subscribe(conversationId, (event: TypingEvent) => {
        if (event.user.id === me.userId) return;
        safeEnqueue(`event: typing\ndata: ${JSON.stringify(event)}\n\n`);
      });

      const heartbeat = setInterval(() => {
        safeEnqueue(`: ping ${Date.now()}\n\n`);
      }, HEARTBEAT_MS);

      const unregisterShutdown = registerShutdownCloser(() => {
        safeEnqueue(`event: shutdown\ndata: {"reason":"server_draining"}\n\n`);
        cleanup();
      });

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try { unsubscribe(); } catch { /* ignore */ }
        try { unregisterShutdown(); } catch { /* ignore */ }
        try { controller.close(); } catch { /* ignore */ }
      };

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
