import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";

const HASHTAG_RE = /#([\p{L}\p{N}_]{1,64})/gu;

export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim().replace(/^#/, "").toLowerCase() ?? "";
  if (!q) return NextResponse.json({ hashtags: [] });

  const blockedIds = await getBlockedUserIds(me.userId);
  const posts = await prisma.post.findMany({
    where: {
      authorId: { notIn: blockedIds },
      caption: { contains: `#${q}`, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { caption: true },
  });

  const counts = new Map<string, number>();
  for (const post of posts) {
    if (!post.caption) continue;
    const seen = new Set<string>();
    for (const m of post.caption.matchAll(HASHTAG_RE)) {
      const tag = m[1]?.toLowerCase();
      if (!tag || !tag.startsWith(q) || seen.has(tag)) continue;
      seen.add(tag);
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const hashtags = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([tag, postCount]) => ({ tag, postCount }));

  return NextResponse.json({ hashtags });
}
