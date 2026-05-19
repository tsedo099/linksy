import "server-only";
import { prisma } from "@/lib/prisma";
import { readStoryMusic } from "@/lib/story-stickers";

/**
 * Aggregate "trending" sounds — i.e. distinct `Story.musicTrack` entries
 * weighted by usage count across recent PUBLIC stories.
 *
 * Bucketing key: `lower(title) || "::" || lower(artist ?? "")` so the same
 * song uploaded by different users still collapses to one row. We use a
 * Postgres-side aggregation when `lookbackHours` is large enough that the
 * scan is non-trivial; the in-memory hash below is correct for the typical
 * size (a few thousand active stories at a time).
 *
 * Visibility: only `audience = PUBLIC` is counted. Follower- and
 * close-circle-restricted stories carry a private signal and shouldn't
 * surface in a trending feed seen by anyone.
 */

export type TrendingSound = {
  title: string;
  artist: string | null;
  mediaUrl: string | null;
  durationSec: number | null;
  /** How many distinct stories used this sound in the lookback window. */
  storyCount: number;
  /** How many distinct authors used it (de-duped per author). */
  uniqueAuthors: number;
  /** Most recent story timestamp using this sound (ISO). */
  latestUsedAt: string;
};

export type TrendingSoundsOptions = {
  /** How far back to look. Default 7 days, max 30. */
  lookbackHours?: number;
  /** Page size. Default 50, max 100. */
  limit?: number;
};

const DEFAULT_LOOKBACK_HOURS = 24 * 7;
const MAX_LOOKBACK_HOURS = 24 * 30;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
/** Hard cap on stories scanned per query so a long lookback can't OOM. */
const MAX_STORIES_SCANNED = 20_000;

export async function computeTrendingSounds(
  opts: TrendingSoundsOptions = {},
): Promise<TrendingSound[]> {
  const lookbackHours = clamp(opts.lookbackHours ?? DEFAULT_LOOKBACK_HOURS, 1, MAX_LOOKBACK_HOURS);
  const limit = clamp(opts.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);

  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

  // `audience = "PUBLIC"` + `musicTrack IS NOT NULL` to short-circuit the scan.
  // We sort newest-first so the cap clips the oldest tail when traffic spikes.
  const rows = await prisma.story.findMany({
    where: {
      audience: "PUBLIC",
      createdAt: { gte: since },
      musicTrack: { not: { equals: null } },
    },
    select: {
      authorId: true,
      musicTrack: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: MAX_STORIES_SCANNED,
  });

  type Bucket = TrendingSound & { authorSet: Set<string> };
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    const music = readStoryMusic(row.musicTrack);
    if (!music) continue;
    const key = bucketKey(music.title, music.artist);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        title: music.title,
        artist: music.artist,
        mediaUrl: music.mediaUrl,
        durationSec: music.durationSec,
        storyCount: 0,
        uniqueAuthors: 0,
        latestUsedAt: row.createdAt.toISOString(),
        authorSet: new Set<string>(),
      };
      buckets.set(key, bucket);
    }
    bucket.storyCount += 1;
    bucket.authorSet.add(row.authorId);
    const iso = row.createdAt.toISOString();
    if (iso > bucket.latestUsedAt) bucket.latestUsedAt = iso;
    // Prefer the most-recently-seen mediaUrl/duration in case different
    // uploads of the same song reference different audio assets.
    if (!bucket.mediaUrl && music.mediaUrl) bucket.mediaUrl = music.mediaUrl;
    if (bucket.durationSec == null && music.durationSec != null) {
      bucket.durationSec = music.durationSec;
    }
  }

  const list = Array.from(buckets.values()).map(({ authorSet, ...rest }) => ({
    ...rest,
    uniqueAuthors: authorSet.size,
  }));

  // Sort: by uniqueAuthors first (better trending signal than raw count —
  // resists a single hyperactive user spamming one sound), then storyCount,
  // then recency.
  list.sort((a, b) => {
    if (b.uniqueAuthors !== a.uniqueAuthors) return b.uniqueAuthors - a.uniqueAuthors;
    if (b.storyCount !== a.storyCount) return b.storyCount - a.storyCount;
    return b.latestUsedAt.localeCompare(a.latestUsedAt);
  });

  return list.slice(0, limit);
}

function bucketKey(title: string, artist: string | null): string {
  return `${title.trim().toLowerCase()}::${(artist ?? "").trim().toLowerCase()}`;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
