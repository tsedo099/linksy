/** Explore / discover ranking: engagement + recency; surface non-follow accounts. */

const MS_PER_HOUR = 60 * 60 * 1000;

export const DISCOVER_POOL_SIZE = 280;
export const DISCOVER_MAX_AGE_MS = 55 * 24 * 60 * 60 * 1000;

export type DiscoverScoreInput = {
  authorId: string;
  likeCount: number;
  commentCount: number;
  createdAt: Date;
  creatorMode?: boolean;
};

export function freshnessFactor(createdAt: Date, now: number): number {
  const ageHours = Math.max(0, (now - createdAt.getTime()) / MS_PER_HOUR);
  return Math.exp(-ageHours / 96);
}

/** Higher = ranked earlier. */
export function discoverScore(
  p: DiscoverScoreInput,
  opts: {
    now: number;
    /** Authors the viewer follows — small penalty so Explore is not clone of Home */
    followingSet: ReadonlySet<string>;
  },
): number {
  const engagement = p.likeCount + p.commentCount * 2 + 4;
  const freshness = freshnessFactor(p.createdAt, opts.now);

  const creatorBoost = p.creatorMode ? 1.12 : 1;
  const followPenalty = opts.followingSet.has(p.authorId) ? 0.88 : 1.15;

  return engagement * freshness * creatorBoost * followPenalty;
}
