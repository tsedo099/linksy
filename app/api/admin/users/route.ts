import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isSafetyAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/users — admin user search + safety summary.
 *
 * Query: ?q=<name|username|email|id>&limit=<n>&cursor=<userId>
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await isSafetyAdmin(me.userId))) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Math.min(100, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 25));
  const cursor = searchParams.get("cursor")?.trim() || undefined;

  const where = q
    ? {
        OR: [
          { id: q },
          { username: { contains: q, mode: "insensitive" as const } },
          { displayName: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : undefined;

  const users = await prisma.user.findMany({
    where,
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    skip: cursor ? 1 : 0,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      avatarUrl: true,
      isVerified: true,
      createdAt: true,
      commentBanUntil: true,
      commentWarnings: true,
      lastCommentWarningAt: true,
      suspendedUntil: true,
      suspendedReason: true,
      _count: { select: { posts: true, commentSafetyWarnings: true } },
    },
  });

  const hasMore = users.length > limit;
  const items = hasMore ? users.slice(0, limit) : users;

  return NextResponse.json({
    users: items.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      avatarUrl: u.avatarUrl,
      isVerified: u.isVerified,
      createdAt: u.createdAt.toISOString(),
      banActive: !!(u.commentBanUntil && u.commentBanUntil.getTime() > Date.now()),
      banUntil: u.commentBanUntil ? u.commentBanUntil.toISOString() : null,
      activeWarnings: u.commentWarnings,
      totalWarnings: u._count.commentSafetyWarnings,
      lastWarningAt: u.lastCommentWarningAt ? u.lastCommentWarningAt.toISOString() : null,
      postCount: u._count.posts,
      suspendedUntil: u.suspendedUntil ? u.suspendedUntil.toISOString() : null,
      suspendedReason: u.suspendedReason ?? null,
      suspensionActive: !!(u.suspendedUntil && u.suspendedUntil.getTime() > Date.now()),
    })),
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
  });
}
