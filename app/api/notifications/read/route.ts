import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { publishNotificationEvent } from "@/lib/notification-bus";
import { parseRequestJsonAllowEmpty } from "@/lib/request-json";
import { notificationsReadSchema } from "@/lib/schemas/api-bodies";

// POST /api/notifications/read - mark notifications as read
// body: { ids?: string[] } - if empty, mark all as read
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJsonAllowEmpty(req, notificationsReadSchema);
  if (!parsed.ok) return parsed.response;
  const ids = parsed.data.ids;

  const result = await prisma.notification.updateMany({
    where: {
      userId: me.userId,
      read: false,
      ...(ids?.length ? { id: { in: ids } } : {}),
    },
    data: { read: true },
  });

  // Tabs / devices ажиглаж байгаа SSE listener-уудад unread badge-ыг
  // тэр даруй буулгахын тулд `read` event publish хийнэ.
  if (result.count > 0) publishNotificationEvent(me.userId, "read");

  return NextResponse.json({ ok: true });
}
