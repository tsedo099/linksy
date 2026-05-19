import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { Prisma } from "@/lib/generated/prisma/client";

const RANGES = ["7d", "30d", "90d"] as const;
type Range = (typeof RANGES)[number];

function isRange(value: string | null): value is Range {
  return value === "7d" || value === "30d" || value === "90d";
}

function rangeToDays(r: Range) {
  return r === "7d" ? 7 : r === "30d" ? 30 : 90;
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDaysUtc(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

function diffPercent(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

/** GET /api/creator/dashboard?range=7d|30d|90d */
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const rangeParam = req.nextUrl.searchParams.get("range");
  const range: Range = isRange(rangeParam) ? rangeParam : "7d";
  const days = rangeToDays(range);

  const now = new Date();
  const periodStart = startOfUtcDay(addDaysUtc(now, -(days - 1)));
  const previousStart = startOfUtcDay(addDaysUtc(now, -(days * 2 - 1)));
  const previousEnd = startOfUtcDay(addDaysUtc(now, -(days - 1)));

  const myPostsWhere: Prisma.PostWhereInput = { authorId: me.userId };

  const [
    totalPostsCount,
    viewsCurrent,
    viewsPrevious,
    likesCurrent,
    commentsCurrent,
    savesCurrent,
    repostsCurrent,
    likesPrevious,
    commentsPrevious,
    savesPrevious,
    repostsPrevious,
    followersCurrentDelta,
    followersPreviousDelta,
    totalFollowers,
    viewsByDayRaw,
    topPostsRaw,
  ] = await Promise.all([
    prisma.post.count({ where: myPostsWhere }),
    prisma.postView.count({
      where: { post: myPostsWhere, viewedAt: { gte: periodStart } },
    }),
    prisma.postView.count({
      where: { post: myPostsWhere, viewedAt: { gte: previousStart, lt: previousEnd } },
    }),
    prisma.like.count({
      where: { post: myPostsWhere, createdAt: { gte: periodStart } },
    }),
    prisma.comment.count({
      where: { post: myPostsWhere, createdAt: { gte: periodStart } },
    }),
    prisma.savedPost.count({
      where: { post: myPostsWhere, createdAt: { gte: periodStart } },
    }),
    prisma.repost.count({
      where: { post: myPostsWhere, createdAt: { gte: periodStart } },
    }),
    prisma.like.count({
      where: { post: myPostsWhere, createdAt: { gte: previousStart, lt: previousEnd } },
    }),
    prisma.comment.count({
      where: { post: myPostsWhere, createdAt: { gte: previousStart, lt: previousEnd } },
    }),
    prisma.savedPost.count({
      where: { post: myPostsWhere, createdAt: { gte: previousStart, lt: previousEnd } },
    }),
    prisma.repost.count({
      where: { post: myPostsWhere, createdAt: { gte: previousStart, lt: previousEnd } },
    }),
    prisma.follow.count({
      where: { followingId: me.userId, createdAt: { gte: periodStart } },
    }),
    prisma.follow.count({
      where: { followingId: me.userId, createdAt: { gte: previousStart, lt: previousEnd } },
    }),
    prisma.follow.count({ where: { followingId: me.userId } }),
    prisma.$queryRaw<Array<{ day: Date; views: bigint }>>(
      Prisma.sql`
        SELECT
          DATE_TRUNC('day', "viewedAt") AS "day",
          COUNT(*)::bigint AS "views"
        FROM "PostView" pv
        JOIN "Post" p ON p."id" = pv."postId"
        WHERE p."authorId" = ${me.userId}
          AND pv."viewedAt" >= ${periodStart}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    ),
    prisma.post.findMany({
      where: { ...myPostsWhere, createdAt: { gte: periodStart } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        caption: true,
        mediaUrls: true,
        createdAt: true,
        _count: { select: { likes: true, comments: true, saved: true, postViews: true } },
      },
    }),
  ]);

  const totalPosts = totalPostsCount;

  const engagementCurrent = likesCurrent + commentsCurrent + savesCurrent + repostsCurrent;
  const engagementPrevious = likesPrevious + commentsPrevious + savesPrevious + repostsPrevious;

  const engagementRateCurrent =
    viewsCurrent > 0 ? (engagementCurrent / viewsCurrent) * 100 : 0;
  const engagementRatePrevious =
    viewsPrevious > 0 ? (engagementPrevious / viewsPrevious) * 100 : 0;

  const dayMap = new Map<string, number>();
  for (const row of viewsByDayRaw) {
    const key = startOfUtcDay(new Date(row.day)).toISOString();
    dayMap.set(key, Number(row.views));
  }

  const chart: { date: string; label: string; views: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysUtc(periodStart, i);
    const iso = d.toISOString();
    const day = d.getUTCDate();
    const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    const label = days <= 7
      ? d.toLocaleString("en-US", { weekday: "short", timeZone: "UTC" })
      : `${month} ${day}`;
    chart.push({ date: iso, label, views: dayMap.get(iso) ?? 0 });
  }

  const topPosts = topPostsRaw
    .map((p) => {
      const eng = p._count.likes + p._count.comments + p._count.saved;
      return {
        id: p.id,
        caption: p.caption,
        mediaUrl: p.mediaUrls[0] ?? null,
        createdAt: p.createdAt.toISOString(),
        views: p._count.postViews,
        likes: p._count.likes,
        comments: p._count.comments,
        saves: p._count.saved,
        engagement: eng,
      };
    })
    .sort((a, b) => b.views - a.views || b.engagement - a.engagement)
    .slice(0, 5);

  const breakdownTotal = engagementCurrent || 1;
  const engagementBreakdown = [
    { key: "likes", label: "Likes", count: likesCurrent, percent: Math.round((likesCurrent / breakdownTotal) * 100) },
    { key: "comments", label: "Comments", count: commentsCurrent, percent: Math.round((commentsCurrent / breakdownTotal) * 100) },
    { key: "saves", label: "Saves", count: savesCurrent, percent: Math.round((savesCurrent / breakdownTotal) * 100) },
    { key: "reposts", label: "Reposts", count: repostsCurrent, percent: Math.round((repostsCurrent / breakdownTotal) * 100) },
  ];

  return NextResponse.json({
    range,
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    totals: {
      posts: totalPosts,
      followers: totalFollowers,
    },
    stats: {
      views: {
        value: viewsCurrent,
        deltaPercent: diffPercent(viewsCurrent, viewsPrevious),
      },
      engagementRate: {
        value: Number(engagementRateCurrent.toFixed(1)),
        deltaPercent: diffPercent(
          Math.round(engagementRateCurrent * 10),
          Math.round(engagementRatePrevious * 10),
        ),
      },
      newFollowers: {
        value: followersCurrentDelta,
        deltaPercent: diffPercent(followersCurrentDelta, followersPreviousDelta),
      },
      engagement: {
        value: engagementCurrent,
        deltaPercent: diffPercent(engagementCurrent, engagementPrevious),
      },
    },
    chart,
    topPosts,
    engagementBreakdown,
  });
}
