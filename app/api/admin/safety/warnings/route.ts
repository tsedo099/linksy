import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isSafetyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/safety/warnings — list recent warnings across all users.
 *
 * Query params:
 *   ?userId=<id>            scope to a single user
 *   ?limit=<n>              default 50, max 200
 *   ?cursor=<warningId>     pagination cursor (createdAt desc, id desc)
 */
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(user.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const userIdFilter = searchParams.get("userId")?.trim() || undefined;
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
  const cursor = searchParams.get("cursor")?.trim() || undefined;

  const warnings = await prisma.commentSafetyWarning.findMany({
    where: userIdFilter ? { userId: userIdFilter } : undefined,
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      user: { select: { id: true, username: true, displayName: true, commentBanUntil: true } },
    },
  });

  const hasMore = warnings.length > limit;
  const items = hasMore ? warnings.slice(0, limit) : warnings;

  return NextResponse.json({
    warnings: items.map((w) => ({
      id: w.id,
      kind: w.kind,
      severity: w.severity,
      score: w.score,
      reason: w.reason,
      excerpt: w.excerpt,
      createdAt: w.createdAt.toISOString(),
      user: {
        id: w.user.id,
        username: w.user.username,
        displayName: w.user.displayName,
        banActive: !!(w.user.commentBanUntil && w.user.commentBanUntil.getTime() > Date.now()),
        banUntil: w.user.commentBanUntil ? w.user.commentBanUntil.toISOString() : null,
      },
    })),
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
  });
}
