import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { getBlockedUserIds } from "@/lib/user-blocks";

const HASHTAG_RE = /#([\p{L}\p{N}_]{1,64})/gu;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const blockedIds = await getBlockedUserIds(me.userId);
  const posts = await prisma.post.findMany({
    where: {
      authorId: { notIn: blockedIds },
      createdAt: { gte: new Date(Date.now() - WINDOW_MS) },
      caption: { contains: "#" },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: { caption: true },
  });

  const counts = new Map<string, number>();
  for (const post of posts) {
    if (!post.caption) continue;
    const seen = new Set<string>();
    for (const m of post.caption.matchAll(HASHTAG_RE)) {
      const tag = m[1]?.toLowerCase();
      if (!tag || seen.has(tag)) continue;
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
