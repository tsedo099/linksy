import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/auth";
import { activeStoryWhere, STORY_TTL_MS, visibleActiveStoryWhere } from "@/lib/story-visibility";
import { isUploadedMediaUrl } from "@/lib/media";
import { extractTrustedUploadBasename } from "@/lib/upload-url";
import {
  formatBytes,
  isAllowedStoryMediaExtension,
  STORY_CAPTION_MAX_LENGTH,
  STORY_CREATE_LIMITS,
  STORY_MEDIA_MAX_SIZE,
  validateStoryCaption,
} from "@/lib/story-limits";
import { getBlockedUserIds } from "@/lib/user-blocks";
import { stat } from "fs/promises";
import { join } from "path";
import { formatPollForViewer, parsePollInput } from "@/lib/polls";
import { parseRequestJsonAllowEmpty } from "@/lib/request-json";
import { storyCreateSchema } from "@/lib/schemas/api-bodies";
import { sanitizePlainText } from "@/lib/sanitize-html";
import { scoreAdultContent } from "@/lib/adult-content";
import { checkUserCanSendAdult } from "@/lib/age-gate";
import { isUnder18 } from "@/lib/age";
import {
  persistStoryCollaborators,
  persistStoryMentions,
  readStoryMusic,
  validateStoryCollaborators,
  validateStoryLocation,
  validateStoryMentions,
  validateStoryMusic,
  validateStoryPlaybackMode,
} from "@/lib/story-stickers";
import { logBackgroundError } from "@/lib/logger";

// GET /api/stories - active stories from followed users
export async function GET(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const now = new Date();

  // All 4 lookups are independent of each other — fire in parallel so the
  // page-load critical path pays the latency of the slowest single query,
  // not the sum.
  const [blockedIds, viewerRow, following, mutedStories] = await Promise.all([
    getBlockedUserIds(me.userId),
    prisma.user
      .findUnique({ where: { id: me.userId }, select: { birthDate: true } })
      .catch(() => null),
    prisma.follow.findMany({
      where: { followerId: me.userId },
      select: { followingId: true },
    }),
    prisma.mute.findMany({
      where: { muterId: me.userId, muteStories: true },
      select: { mutedId: true },
    }),
  ]);

  const blockedSet = new Set(blockedIds);
  const viewerUnder18 = viewerRow?.birthDate ? isUnder18(viewerRow.birthDate) : false;
  const adultStoryFilter = viewerUnder18 ? { containsAdultContent: false } : {};
  const mutedSet = new Set(mutedStories.map((row) => row.mutedId));
  const ids = following
    .map((f) => f.followingId)
    .filter((id) => !blockedSet.has(id) && !mutedSet.has(id));
  ids.push(me.userId);

  const stories = await prisma.story.findMany({
    where: {
      AND: [
        visibleActiveStoryWhere(me.userId, now),
        {
          OR: [
            { authorId: { in: ids } },
            { collaborators: { some: { userId: { in: ids } } } },
          ],
        },
        ...(viewerUnder18 ? [adultStoryFilter] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, allowStoryReplies: true, subscriptionTier: true, creatorMode: true } },
      views: { where: { userId: me.userId }, select: { userId: true } },
      _count: { select: { views: true, reactions: true } },
      reactions: { where: { userId: me.userId }, select: { emoji: true } },
      poll: {
        include: {
          votes: { select: { userId: true, optionIndex: true } },
        },
      },
      mentions: {
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      },
      collaborators: {
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
      },
    },
  });

  // Group the latest active stories per ring owner. A story shows up under the
  // author *and* under each collaborator that the viewer follows (or is). The
  // grouping owner is purely a UI affordance — the underlying story is the
  // same row regardless of which ring it appears in.
  const idsSet = new Set(ids);
  const byUser = new Map<string, typeof stories[0][]>();
  for (const s of stories) {
    const ringOwners = new Set<string>();
    if (idsSet.has(s.authorId)) ringOwners.add(s.authorId);
    for (const collab of s.collaborators) {
      if (idsSet.has(collab.userId)) ringOwners.add(collab.userId);
    }
    if (ringOwners.size === 0) ringOwners.add(s.authorId);
    for (const owner of ringOwners) {
      const arr = byUser.get(owner) ?? [];
      arr.push(s);
      byUser.set(owner, arr);
    }
  }

  const ringOwnerProfiles = new Map<string, typeof stories[0]["author"]>();
  for (const s of stories) {
    ringOwnerProfiles.set(s.authorId, s.author);
    for (const collab of s.collaborators) {
      if (!ringOwnerProfiles.has(collab.userId)) {
        // Collaborators aren't ring owners normally — we synthesise a profile
        // with defaults for the tier/creatorMode fields since they're only
        // used downstream for the Pro boost ranking (collab rings shouldn't
        // inherit the original author's tier).
        ringOwnerProfiles.set(collab.userId, {
          ...collab.user,
          allowStoryReplies: true,
          creatorMode: false,
          subscriptionTier: "FREE",
        });
      }
    }
  }

  const groups = Array.from(byUser.entries()).map(([ownerId, items]) => ({
    authorId: ownerId,
    author: ringOwnerProfiles.get(ownerId) ?? items[0]?.author,
    isCloseCircle: items.some((s) => s.audience === "CLOSE_CIRCLE"),
    // Pro boost: rings owned by a Pro user in Creator Mode rank ahead of
    // other rings (after close-circle). Computed at group level — we look
    // at the ring owner's tier via the first item's author cache.
    isProBoosted: items.some((s) => s.author.id === ownerId && s.author.subscriptionTier === "PRO" && s.author.creatorMode),
    stories: items.map((s) => ({
      id: s.id,
      mediaUrl: s.mediaUrl,
      mediaAlt: s.mediaAlt,
      caption: s.caption,
      location: s.location ?? null,
      music: readStoryMusic(s.musicTrack),
      playbackMode: s.playbackMode,
      mentions: s.mentions.map((mention) => ({
        userId: mention.userId,
        username: mention.user.username,
        displayName: mention.user.displayName,
        avatarUrl: mention.user.avatarUrl,
      })),
      collaborators: s.collaborators.map((collab) => ({
        userId: collab.userId,
        username: collab.user.username,
        displayName: collab.user.displayName,
        avatarUrl: collab.user.avatarUrl,
      })),
      author: {
        id: s.author.id,
        username: s.author.username,
        displayName: s.author.displayName,
        avatarUrl: s.author.avatarUrl,
      },
      audience: s.audience,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      viewedByMe: s.authorId === me.userId || s.views.length > 0,
      viewCount: s._count.views,
      reactionCount: s._count.reactions,
      myReaction: s.reactions[0]?.emoji ?? null,
      poll: formatPollForViewer(s.poll, me.userId),
    })),
    allViewed: items.every((s) => s.authorId === me.userId || s.views.length > 0),
  }));

  // Sort: close-circle rings → Pro creator boosted rings → everyone else.
  groups.sort((a, b) => {
    if (a.isCloseCircle !== b.isCloseCircle) return a.isCloseCircle ? -1 : 1;
    if (a.isProBoosted !== b.isProBoosted) return a.isProBoosted ? -1 : 1;
    return 0;
  });

  return NextResponse.json({ groups });
}

const MAX_MEDIA_URL_LENGTH = 300;
const STORY_CAPTION_META_PREFIX = "[[linksy-story-caption:";
const STORY_CAPTION_META_SUFFIX = "]]";
const STORY_TEXT_COLORS = ["#ffffff", "#111827", "#ef4444", "#f97316", "#facc15", "#22c55e", "#38bdf8", "#6366f1", "#a855f7", "#ec4899"] as const;
const STORY_TEXT_COLOR_DEFAULT: string = STORY_TEXT_COLORS[0];
const STORY_DRAW_MAX_STROKES = 80;
const STORY_DRAW_MAX_POINTS = 180;

function normalizeStoryTextColor(value: unknown): string {
  return typeof value === "string" && (STORY_TEXT_COLORS as readonly string[]).includes(value) ? value : STORY_TEXT_COLOR_DEFAULT;
}

type StoryCaptionStickerInput = {
  text: string;
  x: number;
  y: number;
  width: number;
  scale: number;
  background: boolean;
  z: number;
  color: string;
  mentionUserId?: string;
};

type StoryDrawStrokeInput = {
  color: string;
  width: number;
  points: Array<[number, number]>;
};

function decodeStoryCaptionInput(caption: unknown) {
  if (typeof caption !== "string" || !caption.startsWith(STORY_CAPTION_META_PREFIX)) {
    return { text: caption, stickers: null as StoryCaptionStickerInput[] | null, drawStrokes: null as StoryDrawStrokeInput[] | null };
  }

  const metaEnd = caption.indexOf(STORY_CAPTION_META_SUFFIX);
  if (metaEnd < 0) return { text: caption, stickers: null, drawStrokes: null };

  try {
    const metaRaw = caption.slice(STORY_CAPTION_META_PREFIX.length, metaEnd);
    const meta = JSON.parse(metaRaw) as { stickers?: unknown; draw?: unknown; x?: unknown; y?: unknown; w?: unknown; s?: unknown; bg?: unknown };
    const fallbackText = caption.slice(metaEnd + STORY_CAPTION_META_SUFFIX.length).replace(/^\n/, "");
    const drawStrokes = Array.isArray(meta.draw)
      ? meta.draw.slice(0, STORY_DRAW_MAX_STROKES).flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const item = entry as { c?: unknown; w?: unknown; p?: unknown };
          if (!Array.isArray(item.p)) return [];
          const points = item.p.slice(0, STORY_DRAW_MAX_POINTS).flatMap((point): Array<[number, number]> => {
            if (!Array.isArray(point) || point.length < 2) return [];
            const x = Number(point[0]);
            const y = Number(point[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
            return [[Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y))]];
          });
          if (points.length === 0) return [];
          const width = typeof item.w === "number" && Number.isFinite(item.w) ? Math.min(12, Math.max(1, item.w)) : 4;
          return [{ color: normalizeStoryTextColor(item.c), width, points }];
        })
      : [];
    if (Array.isArray(meta.stickers)) {
      const stickers = meta.stickers.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as { t?: unknown; x?: unknown; y?: unknown; w?: unknown; s?: unknown; bg?: unknown; z?: unknown; c?: unknown; m?: unknown };
        const text = typeof item.t === "string" ? sanitizePlainText(item.t).trim() : "";
        if (!text) return [];
        return [{
          text,
          x: typeof item.x === "number" && Number.isFinite(item.x) ? Math.min(88, Math.max(12, item.x)) : 50,
          y: typeof item.y === "number" && Number.isFinite(item.y) ? Math.min(86, Math.max(14, item.y)) : 50,
          width: typeof item.w === "number" && Number.isFinite(item.w) ? Math.min(72, Math.max(14, item.w)) : 30,
          scale: typeof item.s === "number" && Number.isFinite(item.s) ? Math.min(2.4, Math.max(0.55, item.s)) : 1,
          background: item.bg !== 0,
          z: typeof item.z === "number" && Number.isFinite(item.z) ? Math.max(1, Math.round(item.z)) : 1,
          color: normalizeStoryTextColor(item.c),
          mentionUserId: typeof item.m === "string" ? item.m : undefined,
        }];
      });
      return { text: stickers.map((sticker) => sticker.text).join("\n") || (drawStrokes.length > 0 ? "Drawing" : ""), stickers, drawStrokes };
    }
    const x = typeof meta.x === "number" && Number.isFinite(meta.x) ? Math.min(88, Math.max(12, meta.x)) : 50;
    const y = typeof meta.y === "number" && Number.isFinite(meta.y) ? Math.min(86, Math.max(14, meta.y)) : 50;
    const width = typeof meta.w === "number" && Number.isFinite(meta.w) ? Math.min(72, Math.max(14, meta.w)) : 30;
    const scale = typeof meta.s === "number" && Number.isFinite(meta.s) ? Math.min(2.4, Math.max(0.55, meta.s)) : 1;
    const text = sanitizePlainText(fallbackText).trim();
    return { text: text || (drawStrokes.length > 0 ? "Drawing" : ""), stickers: text ? [{ text, x, y, width, scale, background: meta.bg !== 0, z: 1, color: normalizeStoryTextColor((meta as { c?: unknown }).c) }] : [], drawStrokes };
  } catch {
    return { text: caption, stickers: null, drawStrokes: null };
  }
}

function encodeStoryCaptionStorage(caption: string, stickers: StoryCaptionStickerInput[] | null, drawStrokes: StoryDrawStrokeInput[] | null) {
  if (!stickers) return caption;
  const meta = JSON.stringify({
    stickers: stickers.map((sticker) => ({
      t: sticker.text,
      x: Math.round(sticker.x),
      y: Math.round(sticker.y),
      w: Math.round(sticker.width),
      s: Math.round(sticker.scale * 100) / 100,
      bg: sticker.background ? 1 : 0,
      z: sticker.z,
      c: sticker.color,
      m: sticker.mentionUserId,
    })),
    draw: (drawStrokes ?? []).map((stroke) => ({
      c: stroke.color,
      w: stroke.width,
      p: stroke.points,
    })),
  });
  return `${STORY_CAPTION_META_PREFIX}${meta}${STORY_CAPTION_META_SUFFIX}\n${caption === "Drawing" ? "" : caption}`;
}

function rateLimitResponse(error: string, retryAfterSeconds?: number) {
  return NextResponse.json(
    { error },
    {
      status: 429,
      headers: retryAfterSeconds ? { "Retry-After": String(Math.max(1, Math.ceil(retryAfterSeconds))) } : undefined,
    }
  );
}

function uploadedMediaFilePath(mediaUrl: string): { filename: string; path: string } | null {
  try {
    if (!mediaUrl.startsWith("/uploads/")) return null;
    const pathname = new URL(mediaUrl, "http://local").pathname;
    if (!pathname.startsWith("/uploads/")) return null;
    let filename = "";
    try {
      filename = decodeURIComponent(pathname.slice("/uploads/".length));
    } catch {
      return null;
    }
    if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) return null;
    return { filename, path: join(process.cwd(), "public", "uploads", filename) };
  } catch {
    return null;
  }
}

async function validateUploadedStoryMedia(mediaUrl: string) {
  if (!isUploadedMediaUrl(mediaUrl)) {
    return { ok: false as const, error: "Story media must be uploaded through Linksy." };
  }

  const base = extractTrustedUploadBasename(mediaUrl);
  if (!base || !isAllowedStoryMediaExtension(base)) {
    return { ok: false as const, error: "Story media must be JPG, PNG, WebP, GIF, MP4, MOV, or WebM." };
  }

  const file = uploadedMediaFilePath(mediaUrl);

  if (file) {
    try {
      const info = await stat(file.path);
      if (!info.isFile()) {
        return { ok: false as const, error: "Story media file is invalid." };
      }
      if (info.size <= 0) {
        return { ok: false as const, error: "Story media cannot be empty." };
      }
      if (info.size > STORY_MEDIA_MAX_SIZE) {
        return {
          ok: false as const,
          error: `Story media must be ${formatBytes(STORY_MEDIA_MAX_SIZE)} or less.`,
        };
      }
    } catch {
      return { ok: false as const, error: "Story media file was not found." };
    }
  }

  return { ok: true as const };
}

async function checkStoryCreateLimit(authorId: string, now: Date) {
  const [latest, activeCount, hourlyCount, dailyCount] = await Promise.all([
    prisma.story.findFirst({
      where: { authorId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.story.count({
      where: {
        authorId,
        ...activeStoryWhere(now),
      },
    }),
    prisma.story.count({
      where: {
        authorId,
        createdAt: { gte: new Date(now.getTime() - STORY_CREATE_LIMITS.hourlyWindowMs) },
      },
    }),
    prisma.story.count({
      where: {
        authorId,
        createdAt: { gte: new Date(now.getTime() - STORY_CREATE_LIMITS.dailyWindowMs) },
      },
    }),
  ]);

  if (latest) {
    const waitMs = latest.createdAt.getTime() + STORY_CREATE_LIMITS.cooldownMs - now.getTime();
    if (waitMs > 0) {
      return {
        ok: false as const,
        error: `Please wait ${Math.ceil(waitMs / 1000)} seconds before posting another story.`,
        retryAfterSeconds: Math.ceil(waitMs / 1000),
      };
    }
  }

  if (activeCount >= STORY_CREATE_LIMITS.maxActive) {
    return {
      ok: false as const,
      error: `You can have up to ${STORY_CREATE_LIMITS.maxActive} active stories at a time.`,
    };
  }

  if (hourlyCount >= STORY_CREATE_LIMITS.maxPerHour) {
    return {
      ok: false as const,
      error: `You can share up to ${STORY_CREATE_LIMITS.maxPerHour} stories per hour.`,
      retryAfterSeconds: Math.ceil(STORY_CREATE_LIMITS.hourlyWindowMs / 1000),
    };
  }

  if (dailyCount >= STORY_CREATE_LIMITS.maxPerDay) {
    return {
      ok: false as const,
      error: `You can share up to ${STORY_CREATE_LIMITS.maxPerDay} stories per day.`,
      retryAfterSeconds: Math.ceil(STORY_CREATE_LIMITS.dailyWindowMs / 1000),
    };
  }

  return { ok: true as const };
}

// POST /api/stories - create a story
export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const parsed = await parseRequestJsonAllowEmpty(req, storyCreateSchema);
  if (!parsed.ok) return parsed.response;
  const {
    mediaUrl,
    mediaAlt,
    caption,
    audience,
    poll,
    location,
    music,
    mentionedUserIds,
    collaboratorIds,
    playbackMode,
    containsAdultContent: authorAdultFlag,
  } = parsed.data;

  // Adult-content gate. The keyword scorer runs against the caption text
  // (not the rich-encoded blob) and is OR'd with the explicit toggle. We
  // refuse the create entirely if the author is under 18.
  const captionForScoring = typeof caption === "string" ? caption : "";
  const adultScored = scoreAdultContent(captionForScoring);
  const containsAdultContent = authorAdultFlag === true || adultScored.flagged;
  if (containsAdultContent) {
    const gate = await checkUserCanSendAdult(me.userId);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.message, reason: gate.reason },
        { status: 403 },
      );
    }
  }

  const captionInput = decodeStoryCaptionInput(caption);
  const captionResult = validateStoryCaption(captionInput.text);
  if (!captionResult.ok) {
    return NextResponse.json({ error: captionResult.error }, { status: 400 });
  }

  const normalizedMediaUrl = mediaUrl?.trim() || "gradient";
  const normalizedCaptionText = captionResult.caption
    ? sanitizePlainText(captionResult.caption).trim() || null
    : null;
  const normalizedCaption = normalizedCaptionText
    ? encodeStoryCaptionStorage(normalizedCaptionText, captionInput.stickers, captionInput.drawStrokes)
    : null;
  if (normalizedCaptionText && normalizedCaptionText.length > STORY_CAPTION_MAX_LENGTH) {
    return NextResponse.json(
      { error: `Caption must be ${STORY_CAPTION_MAX_LENGTH} characters or less.` },
      { status: 400 },
    );
  }
  const normalizedAudience = typeof audience === "string" && ["PUBLIC", "FOLLOWERS", "CLOSE_CIRCLE"].includes(audience)
    ? audience
    : "PUBLIC";
  const normalizedPoll = poll == null ? null : parsePollInput(poll);
  const isGradientMedia = normalizedMediaUrl === "gradient" || normalizedMediaUrl.startsWith("linear-gradient");
  const normalizedMediaAltRaw = (mediaAlt ?? "").trim();
  const normalizedMediaAlt = normalizedMediaAltRaw
    ? sanitizePlainText(normalizedMediaAltRaw).trim() || null
    : null;

  if (poll != null && !normalizedPoll) {
    return NextResponse.json(
      { error: "Poll must include a question and 2-4 unique options." },
      { status: 400 }
    );
  }

  const locationCheck = validateStoryLocation(location);
  if (!locationCheck.ok) {
    return NextResponse.json({ error: locationCheck.error }, { status: 400 });
  }

  const musicCheck = validateStoryMusic(music);
  if (!musicCheck.ok) {
    return NextResponse.json({ error: musicCheck.error }, { status: 400 });
  }

  const mentionsCheck = await validateStoryMentions(mentionedUserIds, me.userId);
  if (!mentionsCheck.ok) {
    return NextResponse.json({ error: mentionsCheck.error }, { status: 400 });
  }

  const collaboratorsCheck = await validateStoryCollaborators(collaboratorIds, me.userId);
  if (!collaboratorsCheck.ok) {
    return NextResponse.json({ error: collaboratorsCheck.error }, { status: 400 });
  }

  const playbackCheck = validateStoryPlaybackMode(playbackMode);
  if (!playbackCheck.ok) {
    return NextResponse.json({ error: playbackCheck.error }, { status: 400 });
  }

  if (normalizedMediaUrl.length > MAX_MEDIA_URL_LENGTH) {
    return NextResponse.json({ error: "Story media value is too long." }, { status: 400 });
  }

  if (isGradientMedia && !normalizedCaption) {
    return NextResponse.json({ error: "Add a caption or photo/video to your story." }, { status: 400 });
  }

  if (!isGradientMedia) {
    const mediaResult = await validateUploadedStoryMedia(normalizedMediaUrl);
    if (!mediaResult.ok) {
      return NextResponse.json({ error: mediaResult.error }, { status: 400 });
    }
    if (!normalizedMediaAlt) {
      return NextResponse.json(
        { error: "Describe your photo or video for screen readers (alt text)." },
        { status: 400 },
      );
    }
  }

  const now = new Date();
  const limit = await checkStoryCreateLimit(me.userId, now);
  if (!limit.ok) {
    return rateLimitResponse(limit.error, limit.retryAfterSeconds);
  }

  const expiresAt = new Date(now.getTime() + STORY_TTL_MS);

  const story = await prisma.story.create({
    data: {
      authorId: me.userId,
      mediaUrl: normalizedMediaUrl,
      mediaAlt: isGradientMedia ? null : normalizedMediaAlt,
      caption: normalizedCaption,
      audience: normalizedAudience,
      expiresAt,
      location: locationCheck.value,
      musicTrack: musicCheck.value ?? undefined,
      playbackMode: playbackCheck.value,
      containsAdultContent,
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
      author: { select: { id: true, username: true, displayName: true, avatarUrl: true, allowStoryReplies: true } },
      poll: {
        include: {
          votes: { select: { userId: true, optionIndex: true } },
        },
      },
    },
  });

  if (mentionsCheck.userIds.length > 0) {
    persistStoryMentions({
      storyId: story.id,
      authorId: me.userId,
      userIds: mentionsCheck.userIds,
    }).catch(logBackgroundError("stories.persistMentions"));
  }

  if (collaboratorsCheck.userIds.length > 0) {
    persistStoryCollaborators({
      storyId: story.id,
      authorId: me.userId,
      userIds: collaboratorsCheck.userIds,
    }).catch(logBackgroundError("stories.persistCollaborators"));
  }

  return NextResponse.json({
    story: {
      ...story,
      music: readStoryMusic(story.musicTrack),
      mentionedUserIds: mentionsCheck.userIds,
      collaboratorIds: collaboratorsCheck.userIds,
      poll: formatPollForViewer(story.poll, me.userId),
    },
  }, { status: 201 });
}
