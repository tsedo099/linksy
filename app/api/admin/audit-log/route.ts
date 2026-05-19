import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isSafetyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/audit-log — recent admin / safety actions.
 *
 * Query: ?action=<prefix>&limit=<n>&cursor=<logId>
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const actionFilter = searchParams.get("action")?.trim() || undefined;
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
  const cursor = searchParams.get("cursor")?.trim() || undefined;

  const logs = await prisma.auditLog.findMany({
    where: actionFilter ? { action: { startsWith: actionFilter } } : undefined,
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      action: true,
      actorUserId: true,
      targetType: true,
      targetId: true,
      ipAddress: true,
      metadata: true,
      createdAt: true,
    },
  });

  const hasMore = logs.length > limit;
  const items = hasMore ? logs.slice(0, limit) : logs;

  const actorIds = Array.from(new Set(items.map((l) => l.actorUserId).filter((id): id is string => Boolean(id))));
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, username: true, displayName: true },
      })
    : [];
  const actorMap = new Map(actors.map((u) => [u.id, u]));

  return NextResponse.json({
    logs: items.map((l) => ({
      id: l.id,
      action: l.action,
      actor: l.actorUserId ? actorMap.get(l.actorUserId) ?? { id: l.actorUserId } : null,
      targetType: l.targetType,
      targetId: l.targetId,
      ipAddress: l.ipAddress,
      metadata: l.metadata,
      createdAt: l.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
  });
}
