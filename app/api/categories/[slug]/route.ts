import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findPostCategoryBySlug } from "@/lib/post-categories";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { publishedPostWhere } from "@/lib/post-schedule";

/** GET /api/categories/[slug] — list public posts in a category. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { slug } = await params;
  const category = findPostCategoryBySlug(slug);
  if (!category) {
    return NextResponse.json({ error: "Unknown category." }, { status: 404 });
  }

  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const limitRaw = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Math.min(40, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 24));

  const blockedIds = await getBlockedUserIds(me.userId);

  const posts = await prisma.post.findMany({
    where: {
      AND: [
        { category: category.slug, audience: "PUBLIC" },
        publishedPostWhere(),
        blockedIds.length > 0 ? { authorId: { notIn: blockedIds } } : {},
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      mediaUrls: true,
      caption: true,
      createdAt: true,
      author: {
        select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true },
      },
      _count: { select: { likes: true, comments: true } },
    },
  });

  const hasMore = posts.length > limit;
  const items = hasMore ? posts.slice(0, limit) : posts;

  return NextResponse.json({
    category: { slug: category.slug, label: category.label, description: category.description },
    posts: items.map((p) => ({
      id: p.id,
      mediaUrls: p.mediaUrls,
      caption: p.caption,
      createdAt: p.createdAt.toISOString(),
      author: p.author,
      likes: p._count.likes,
      comments: p._count.comments,
    })),
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
  });
}
