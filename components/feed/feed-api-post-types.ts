export type ApiPost = {
  id: string;
  mediaUrls: string[];
  /** Parallel to mediaUrls when set (accessibility). */
  mediaAltTexts?: string[];
  caption: string | null;
  captionLang?: string | null;
  location: string | null;
  category: string | null;
  audience: string;
  createdAt: string;
  likedByMe: boolean;
  savedByMe: boolean;
  isCloseCircle: boolean;
  poll: {
    id: string;
    question: string;
    options: Array<{
      index: number;
      text: string;
      votes: number;
      percentage: number;
    }>;
    totalVotes: number;
    votedOptionIndex: number | null;
    expiresAt: string | null;
    expired: boolean;
  } | null;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null; isVerified: boolean; creatorMode?: boolean; level?: number };
  _count: { likes: number; comments: number };
  coAuthors?: Array<{ id: string; username: string; displayName: string; avatarUrl: string | null; isVerified: boolean }>;
  /** Album / series this post belongs to */
  series?: { id: string; title: string } | null;
  /** Per-viewer: like count hidden (non-authors when post has hideLikes). */
  likesHidden?: boolean;
  /** Per-viewer: new comments allowed (always true for post author). */
  commentsEnabled?: boolean;
  /** Marked NSFW by author (or server-side keyword scorer). Server already filters this OUT for under-18 viewers, so when this is `true` here the viewer is 18+. */
  containsAdultContent?: boolean;
};
