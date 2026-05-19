import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { grantXP } from "@/lib/services/xp.service";
import { logBackgroundError } from "@/lib/logger";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { formatPollForViewer, parsePollInput } from "@/lib/polls";
import { Prisma } from "@/lib/generated/prisma/client";
import { DISCOVER_MAX_AGE_MS, DISCOVER_POOL_SIZE, discoverScore } from "@/lib/explore-discovery";
import { parseRequestJson } from "@/lib/request-json";
import { postCreateSchema } from "@/lib/schemas/api-bodies";
import { sanitizePlainText } from "@/lib/sanitize-html";
import { detectCaptionLanguage } from "@/lib/caption-language";
import {
  publishedPostWhere,
  validateScheduledAt,
} from "@/lib/post-schedule";
import { applyPostMentions } from "@/lib/post-mentions";
import { withPostViewerFields } from "@/lib/post-viewer";
import {
  POST_COLLABORATORS_INCLUDE,
  resolvePostCollaboratorIds,
  withCoAuthors,
} from "@/lib/post-collaborators";
import { approvedCommentsOnlyCount } from "@/lib/post-comment-moderation";
import { postsCreatedTotal } from "@/lib/metrics";
import { trackActiveUser } from "@/lib/active-users";
import { withMetrics } from "@/lib/with-metrics";
import { scoreAdultContent } from "@/lib/adult-content";
import { checkUserCanSendAdult } from "@/lib/age-gate";

const PAGE_SIZE = 10;

const FEED_COUNT_INCLUDE = {
  _count: {
    select: {
      likes: true,
      ...approvedCommentsOnlyCount,
    },
  },
} as const;

const POST_SERIES_INCLUDE = {
  series: { select: { id: true, title: true } },
} as const;

const AUTHOR_SELECT = {
  id: true, username: true, displayName: true,
  avatarUrl: true, isVerified: true,
  creatorMode: true, level: true,
  subscriptionTier: true,
} as const;

/**
 * Pro creators in Creator Mode get a recency boost in the "For You" feed —
 * their posts are sorted as if they were 12 hours newer than they actually
 * are. Implemented as a soft signal (not a hard filter) so Free posts still
 * surface; it just nudges Pro creators above otherwise-equal content within
 * the same page. Constant lives here, not in env, so changes are intentional.
 */
const PRO_CREATOR_BOOST_MS = 12 * 60 * 60 * 1000;

function isMissingPollTable(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === "P2021"
    && String((error as Error).message).includes('public.Poll');
}

// GET /api/posts - smart feed: close circle first, then friends, then all
// ?filter=all|friends|close-circle|creator|discover
// discover: ranked public discovery (engagement + freshness); ?offset= page slice
export const GET = withMetrics("/api/posts", async (req: NextRequest) => {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const cursor = req.nextUrl.searchParams.get("cursor");
  const filter = req.nextUrl.searchParams.get("filter") ?? "all";
  const feedNow = new Date();

  // Fire the 4 independent lookups (blocked ids, viewer row, follows, close
  // circle) in parallel. With Aiven/Vercel RTT in the 50–200ms range,
  // serializing these added ~600ms to every feed load — now we pay the cost
  // of the slowest single query, not the sum.
  const [blockedIds, viewerRow, followingRows, circleRowsRaw] = await Promise.all([
    getBlockedUserIds(user.userId),
    prisma.user
      .findUnique({ where: { id: user.userId }, select: { birthDate: true } })
      .catch(() => null),
    prisma.follow.findMany({
      where: { followerId: user.userId },
      select: { followingId: true },
    }),
    prisma.closeCircle.findMany({
      where: { userId: user.userId },
      select: { targetId: true },
    }),
  ]);

  let viewerUnder18 = false;
  if (viewerRow?.birthDate) {
    const { isUnder18 } = await import("@/lib/age");
    viewerUnder18 = isUnder18(viewerRow.birthDate);
  }
  const adultFeedFilter = viewerUnder18 ? { containsAdultContent: false } : {};

  // ── Creator feed: all PUBLIC posts from users with creatorMode=true ────────
  if (filter === "creator") {
    let posts;
    try {
      posts = await prisma.post.findMany({
        where: {
          AND: [
            {
              authorId: { notIn: blockedIds },
              audience: "PUBLIC",
              author: { creatorMode: true },
              ...adultFeedFilter,
            },
            publishedPostWhere(feedNow),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          author: { select: AUTHOR_SELECT },
          ...POST_COLLABORATORS_INCLUDE,
          ...POST_SERIES_INCLUDE,
          ...FEED_COUNT_INCLUDE,
          likes: { where: { userId: user.userId }, select: { userId: true } },
          saved: { where: { userId: user.userId }, select: { userId: true } },
          poll: {
            include: {
              votes: { select: { userId: true, optionIndex: true } },
            },
          },
        },
      });
    } catch (error) {
      if (!isMissingPollTable(error)) throw error;
      posts = await prisma.post.findMany({
        where: {
          AND: [
            {
              authorId: { notIn: blockedIds },
              audience: "PUBLIC",
              author: { creatorMode: true },
              ...adultFeedFilter,
            },
            publishedPostWhere(feedNow),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          author: { select: AUTHOR_SELECT },
          ...POST_COLLABORATORS_INCLUDE,
          ...POST_SERIES_INCLUDE,
          ...FEED_COUNT_INCLUDE,
          likes: { where: { userId: user.userId }, select: { userId: true } },
          saved: { where: { userId: user.userId }, select: { userId: true } },
        },
      });
    }

    const hasMore = posts.length > PAGE_SIZE;
    const items   = hasMore ? posts.slice(0, PAGE_SIZE) : posts;
    return NextResponse.json({
      posts: items.map((p) => withPostViewerFields(withCoAuthors({
        ...p,
        likedByMe:    p.likes.length > 0,
        savedByMe:    p.saved.length > 0,
        isCloseCircle: false,
        poll: "poll" in p ? formatPollForViewer((p as { poll: Parameters<typeof formatPollForViewer>[0] }).poll, user.userId) : null,
        likes: undefined,
        saved: undefined,
      }), user.userId)),
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    });
  }

  // ── Explore / Discover: ranked public posts (not a chronological home clone) ─
  if (filter === "discover") {
    const offsetRaw = req.nextUrl.searchParams.get("offset");
    let offset = offsetRaw === null ? 0 : Number.parseInt(offsetRaw, 10);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;

    const mutedRows = await prisma.mute.findMany({
      where: { muterId: user.userId, mutePosts: true },
      select: { mutedId: true },
    });
    const excludeAuthors = [...new Set([...blockedIds, ...mutedRows.map((m) => m.mutedId)])];

    const since = new Date(Date.now() - DISCOVER_MAX_AGE_MS);

    // followingRows was already fetched at the top in parallel with the
    // other independent lookups — no need for another round trip.
    const followingSet = new Set(followingRows.map((r) => r.followingId));

    const visibilityWhereDiscover: Prisma.PostWhereInput = {
      AND: [
        {
          audience: "PUBLIC",
          ...(excludeAuthors.length > 0 ? { authorId: { notIn: excludeAuthors } } : {}),
          ...adultFeedFilter,
          createdAt: { gte: since },
        },
        publishedPostWhere(feedNow),
      ],
    };

    let poolRaw;
    try {
      poolRaw = await prisma.post.findMany({
        where: visibilityWhereDiscover,
        orderBy: { createdAt: "desc" },
        take: DISCOVER_POOL_SIZE,
        include: {
          author: { select: AUTHOR_SELECT },
          ...POST_COLLABORATORS_INCLUDE,
          ...POST_SERIES_INCLUDE,
          ...FEED_COUNT_INCLUDE,
          likes: { where: { userId: user.userId }, select: { userId: true } },
          saved: { where: { userId: user.userId }, select: { userId: true } },
          poll: {
            include: {
              votes: { select: { userId: true, optionIndex: true } },
            },
          },
        },
      });
    } catch (error) {
      if (!isMissingPollTable(error)) throw error;
      poolRaw = await prisma.post.findMany({
        where: visibilityWhereDiscover,
        orderBy: { createdAt: "desc" },
        take: DISCOVER_POOL_SIZE,
        include: {
          author: { select: AUTHOR_SELECT },
          ...POST_COLLABORATORS_INCLUDE,
          ...POST_SERIES_INCLUDE,
          ...FEED_COUNT_INCLUDE,
          likes: { where: { userId: user.userId }, select: { userId: true } },
          saved: { where: { userId: user.userId }, select: { userId: true } },
        },
      });
    }

    const now = Date.now();
    const ranked = [...poolRaw].sort((a, b) => {
      const authorA = "author" in a && a.author != null ? a.author : { creatorMode: false };
      const authorB = "author" in b && b.author != null ? b.author : { creatorMode: false };
      const sa = discoverScore(
        {
          authorId: a.authorId,
          likeCount: a.likeCount,
          commentCount: a.commentCount,
          createdAt: a.createdAt,
          creatorMode: Boolean((authorA as { creatorMode?: boolean }).creatorMode),
        },
        { now, followingSet },
      );
      const sb = discoverScore(
        {
          authorId: b.authorId,
          likeCount: b.likeCount,
          commentCount: b.commentCount,
          createdAt: b.createdAt,
          creatorMode: Boolean((authorB as { creatorMode?: boolean }).creatorMode),
        },
        { now, followingSet },
      );
      if (sb !== sa) return sb - sa;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const slice = ranked.slice(offset, offset + PAGE_SIZE);
    const hasMore = offset + PAGE_SIZE < ranked.length;
    const itemsDiscover = slice;
    const nextOffset = hasMore ? offset + itemsDiscover.length : null;

    return NextResponse.json({
      posts: itemsDiscover.map((p) => withPostViewerFields(withCoAuthors({
        ...p,
        likedByMe: p.likes.length > 0,
        savedByMe: p.saved.length > 0,
        isCloseCircle: false,
        poll: "poll" in p ? formatPollForViewer((p as { poll: Parameters<typeof formatPollForViewer>[0] }).poll, user.userId) : null,
        likes: undefined,
        saved: undefined,
      }), user.userId)),
      nextOffset,
      nextCursor: null,
    });
  }

  // ── Regular feed ───────────────────────────────────────────────────────────
  // followingRows + circleRowsRaw were already fetched in parallel above.
  const blockedSet = new Set(blockedIds);
  const followingIds = followingRows.map((f) => f.followingId).filter((id) => !blockedSet.has(id));
  const circleIds = circleRowsRaw.map((r) => r.targetId).filter((id) => !blockedSet.has(id));

  // Build where clause per filter
  const friendsAndSelf  = [...followingIds, user.userId];
  const circleAndSelf   = [...circleIds,    user.userId];

  const visibilityWhere =
    filter === "close-circle"
      ? {
          authorId: { in: circleAndSelf },
          OR: [
            { audience: "PUBLIC" },
            { audience: "FRIENDS",      authorId: { in: friendsAndSelf } },
            { audience: "CLOSE_CIRCLE", authorId: { in: circleAndSelf  } },
          ],
        }
      : filter === "friends"
      ? {
          authorId: { in: friendsAndSelf },
          OR: [
            { audience: "PUBLIC" },
            { audience: "FRIENDS",      authorId: { in: friendsAndSelf } },
            { audience: "CLOSE_CIRCLE", authorId: { in: circleAndSelf  } },
          ],
        }
      : /* "all" — FOR YOU: public + friends-of-mine. Close-circle posts
           are intentionally EXCLUDED — they should only surface when the
           viewer explicitly switches to the Close Circle filter. Previous
           leak caused close-circle posts of people the viewer had added to
           their own list to pop up on the main feed without consent. */
        {
          OR: [
            { audience: "PUBLIC" },
            { audience: "FRIENDS", authorId: { in: friendsAndSelf } },
          ],
        };
  const whereClause = {
    AND: [
      ...(blockedIds.length > 0 ? [{ authorId: { notIn: blockedIds } }] : []),
      visibilityWhere,
      publishedPostWhere(feedNow),
      ...(viewerUnder18 ? [adultFeedFilter] : []),
    ],
  };

  let posts;
  try {
    posts = await prisma.post.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: { select: AUTHOR_SELECT },
        ...POST_COLLABORATORS_INCLUDE,
        ...POST_SERIES_INCLUDE,
        ...FEED_COUNT_INCLUDE,
        likes: { where: { userId: user.userId }, select: { userId: true } },
        saved: { where: { userId: user.userId }, select: { userId: true } },
        poll: {
          include: {
            votes: { select: { userId: true, optionIndex: true } },
          },
        },
      },
    });
  } catch (error) {
    if (!isMissingPollTable(error)) throw error;
    posts = await prisma.post.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: { select: AUTHOR_SELECT },
        ...POST_COLLABORATORS_INCLUDE,
        ...POST_SERIES_INCLUDE,
        ...FEED_COUNT_INCLUDE,
        likes: { where: { userId: user.userId }, select: { userId: true } },
        saved: { where: { userId: user.userId }, select: { userId: true } },
      },
    });
  }

  const hasMore = posts.length > PAGE_SIZE;
  const items   = hasMore ? posts.slice(0, PAGE_SIZE) : posts;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

  const circleSet   = new Set(circleIds);
  const rankedAt = (p: (typeof items)[number]): number => {
    const t = new Date(p.createdAt).getTime();
    // Pro tier + Creator Mode = visible-but-soft boost. Free creators and
    // Pro creators with Creator Mode OFF rank by raw recency.
    const boosted = p.author.subscriptionTier === "PRO" && p.author.creatorMode;
    return boosted ? t + PRO_CREATOR_BOOST_MS : t;
  };
  const sorted = filter === "all"
    ? [...items].sort((a, b) => {
        const aC = circleSet.has(a.authorId) ? 0 : 1;
        const bC = circleSet.has(b.authorId) ? 0 : 1;
        if (aC !== bC) return aC - bC;
        return rankedAt(b) - rankedAt(a);
      })
    : items;

  return NextResponse.json({
    posts: sorted.map((p) => withPostViewerFields(withCoAuthors({
      ...p,
      likedByMe:    p.likes.length > 0,
      savedByMe:    p.saved.length > 0,
      isCloseCircle: circleSet.has(p.authorId),
      poll: "poll" in p ? formatPollForViewer((p as { poll: Parameters<typeof formatPollForViewer>[0] }).poll, user.userId) : null,
      likes: undefined,
      saved: undefined,
    }), user.userId)),
    nextCursor,
  });
});

// POST /api/posts - create a post
export const POST = withMetrics("/api/posts", async (req: NextRequest) => {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJson(req, postCreateSchema);
  if (!parsed.ok) return parsed.response;
  const {
    mediaUrls,
    mediaAltTexts,
    caption,
    location,
    audience,
    poll,
    scheduledAt,
    allowComments,
    hideLikes,
    collaboratorUsernames,
    moderateComments,
    seriesId,
    newSeriesTitle,
    captionLang: captionLangBody,
    containsAdultContent: authorAdultFlag,
  } = parsed.data;

  // Adult-content gate (caption-based). The keyword scorer is OR'd with the
  // explicit composer toggle. If either is set AND the author is under 18,
  // we refuse — there is no "would-be adult but redacted" branch on the
  // feed side; this is a strict can-they-post-it check.
  const adultScored = scoreAdultContent(caption ?? "");
  const containsAdultContent = authorAdultFlag === true || adultScored.flagged;
  if (containsAdultContent) {
    const gate = await checkUserCanSendAdult(user.userId);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.message, reason: gate.reason },
        { status: 403 },
      );
    }
  }

  const normalizedMediaUrls = Array.isArray(mediaUrls)
    ? mediaUrls.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const normalizedMediaAltTexts: string[] =
    normalizedMediaUrls.length === 0
      ? []
      : normalizedMediaUrls.map((_, i) =>
          sanitizePlainText(String((mediaAltTexts ?? [])[i] ?? "").trim()).trim(),
        );
  const normalizedCaption = sanitizePlainText((caption ?? "").trim()) || undefined;
  const captionLangResolved =
    captionLangBody ??
    (normalizedCaption ? detectCaptionLanguage(normalizedCaption) : null);
  const normalizedLocation = location ? sanitizePlainText(location.trim()) || undefined : undefined;
  const normalizedAudience = ["PUBLIC", "FRIENDS", "CLOSE_CIRCLE"].includes(audience ?? "")
    ? audience!
    : "PUBLIC";
  const normalizedPoll = poll == null ? null : parsePollInput(poll);

  if (poll != null && !normalizedPoll) {
    return NextResponse.json(
      { error: "Poll must include a question and 2-4 unique options." },
      { status: 400 }
    );
  }

  if (normalizedMediaUrls.length === 0 && !normalizedCaption && !normalizedPoll) {
    return NextResponse.json({ error: "Add a caption, at least one media item, or a poll." }, { status: 400 });
  }

  const scheduleCheck = validateScheduledAt(scheduledAt);
  if (!scheduleCheck.ok) {
    return NextResponse.json({ error: scheduleCheck.error }, { status: 400 });
  }

  const allowCommentsNorm = allowComments !== false;
  const hideLikesNorm = hideLikes === true;
  const coAuthorIds = await resolvePostCollaboratorIds(user.userId, collaboratorUsernames);

  let resolvedSeriesId: string | null = seriesId ?? null;
  const trimmedNewSeriesTitle = newSeriesTitle != null ? sanitizePlainText(String(newSeriesTitle).trim()) : "";
  if (trimmedNewSeriesTitle) {
    if (resolvedSeriesId) {
      return NextResponse.json(
        { error: "Send either seriesId or newSeriesTitle, not both." },
        { status: 400 }
      );
    }
    const created = await prisma.postSeries.create({
      data: { userId: user.userId, title: trimmedNewSeriesTitle },
      select: { id: true },
    });
    resolvedSeriesId = created.id;
  } else if (resolvedSeriesId) {
    const ownsSeries = await prisma.postSeries.findFirst({
      where: { id: resolvedSeriesId, userId: user.userId },
      select: { id: true },
    });
    if (!ownsSeries) {
      return NextResponse.json({ error: "Series not found or not yours." }, { status: 403 });
    }
  }

  let seriesPosition: number | undefined;
  if (resolvedSeriesId) {
    const agg = await prisma.post.aggregate({
      where: { seriesId: resolvedSeriesId },
      _max: { seriesPosition: true },
    });
    seriesPosition = (agg._max.seriesPosition ?? -1) + 1;
  }

  const post = await prisma.post.create({
    data: {
      authorId: user.userId,
      mediaUrls: normalizedMediaUrls,
      mediaAltTexts: normalizedMediaAltTexts,
      caption: normalizedCaption,
      captionLang: captionLangResolved,
      location: normalizedLocation,
      category: null,
      audience: normalizedAudience,
      allowComments: allowCommentsNorm,
      hideLikes: hideLikesNorm,
      moderateComments: moderateComments === true,
      containsAdultContent,
      ...(resolvedSeriesId && seriesPosition != null
        ? { seriesId: resolvedSeriesId, seriesPosition }
        : {}),
      scheduledAt: scheduleCheck.value,
      ...(coAuthorIds.length
        ? { collaborators: { create: coAuthorIds.map((userId) => ({ userId })) } }
        : {}),
      ...(normalizedPoll
        ? {
            poll: {
              create: {
                question: normalizedPoll.question,
                options: normalizedPoll.options,
                expiresAt: normalizedPoll.durationHours
                  ? new Date(Date.now() + normalizedPoll.durationHours * 60 * 60 * 1000)
                  : null,
              },
            },
          }
        : {}),
    },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true } },
      ...POST_COLLABORATORS_INCLUDE,
      ...POST_SERIES_INCLUDE,
      ...FEED_COUNT_INCLUDE,
      poll: {
        include: {
          votes: { select: { userId: true, optionIndex: true } },
        },
      },
    },
  });

  // Defer XP for scheduled posts until the cron publisher flips scheduledAt.
  if (!scheduleCheck.value) {
    grantXP({ userId: user.userId, action: "POST_CREATED", postId: post.id }).catch(logBackgroundError("xp.grant.POST_CREATED"));
  }

  applyPostMentions({
    postId: post.id,
    authorId: user.userId,
    caption: normalizedCaption ?? null,
  }).catch(logBackgroundError("mentions.post"));

  postsCreatedTotal.inc({ kind: "post" });
  void trackActiveUser(user.userId);

  return NextResponse.json({
    post: withPostViewerFields(withCoAuthors({
      ...post,
      likedByMe: false,
      savedByMe: false,
      poll: formatPollForViewer(post.poll, user.userId),
    }), user.userId),
    scheduled: Boolean(scheduleCheck.value),
  }, { status: 201 });
});
