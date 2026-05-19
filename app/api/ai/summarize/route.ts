import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { generateOnce } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { consumeAiQuota, userTier } from "@/lib/ai-quota";

/**
 * GET /api/ai/summarize
 * Returns: `{ summary: string }` — 3-sentence digest of the viewer's
 * recent feed (top posts from people they follow, last 24h).
 */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let posts: Array<{ text: string; author: string }> = [];
  try {
    const rows = await prisma.post.findMany({
      where: {
        createdAt: { gte: since },
        author: { followers: { some: { followerId: me.userId } } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        caption: true,
        author: { select: { username: true, displayName: true } },
      },
    });
    posts = rows.map((row) => ({
      text: (row.caption ?? "").slice(0, 280),
      author: row.author.displayName || row.author.username,
    }));
  } catch {
    posts = [];
  }

  if (posts.length === 0) {
    return NextResponse.json({
      summary: "No recent posts from your follows in the last 24 hours — explore the feed to discover more creators.",
    });
  }

  const quota = await consumeAiQuota(me.userId, await userTier(me.userId));
  if (!quota.allowed) {
    return NextResponse.json(
      { error: "Daily AI quota exceeded. Upgrade to Pro for 25× more requests.", quota },
      { status: 429 },
    );
  }

  const prompt = [
    "Summarize the following recent posts from a user's social feed in EXACTLY 3 sentences.",
    "Mention the most-discussed topics and any standout creators by name.",
    "No bullet points — just three plain sentences.",
    "",
    ...posts.map((p, i) => `${i + 1}. ${p.author}: ${p.text}`),
  ].join("\n");

  try {
    const summary = (await generateOnce({ prompt })).trim();
    return NextResponse.json({ summary, quota });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
