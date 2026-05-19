const STORY_TTL_MS = 24 * 60 * 60 * 1000;

export type StoryPlaybackMode = "NORMAL" | "LOOP" | "BOOMERANG";

export type ApiStoryCollaborator = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ApiStoryItem = {
  id: string;
  mediaUrl: string;
  mediaAlt?: string | null;
  caption: string | null;
  audience?: "PUBLIC" | "FOLLOWERS" | "CLOSE_CIRCLE" | string;
  createdAt: string;
  expiresAt?: string;
  viewedByMe?: boolean;
  viewCount?: number;
  playbackMode?: StoryPlaybackMode | string | null;
  collaborators?: ApiStoryCollaborator[];
  author?: { id: string; username: string; displayName: string; avatarUrl: string | null };
  reactionCount?: number;
  myReaction?: string | null;
  /** Marked NSFW by author. Server filters this OUT for under-18 viewers so when set the viewer is 18+. */
  containsAdultContent?: boolean;
};

export type ApiStoryGroup = {
  authorId: string;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null; allowStoryReplies?: boolean };
  stories: ApiStoryItem[];
  allViewed: boolean;
  isCloseCircle: boolean;
};

export function storyExpiryMs(story: ApiStoryItem) {
  const explicitExpiry = story.expiresAt ? new Date(story.expiresAt).getTime() : Number.NaN;
  if (Number.isFinite(explicitExpiry)) return explicitExpiry;

  const createdAt = new Date(story.createdAt).getTime();
  return Number.isFinite(createdAt) ? createdAt + STORY_TTL_MS : 0;
}

export function pruneExpiredStoryGroups(groups: ApiStoryGroup[]) {
  const now = Date.now();
  let changed = false;

  const nextGroups = groups
    .map((group) => {
      const activeStories = group.stories.filter((story) => storyExpiryMs(story) > now);
      if (activeStories.length !== group.stories.length) changed = true;
      if (activeStories.length === 0) return null;

      return activeStories.length === group.stories.length
        ? group
        : {
            ...group,
            stories: activeStories,
            allViewed: activeStories.every((story) => Boolean(story.viewedByMe)),
          };
    })
    .filter((group): group is ApiStoryGroup => group !== null);

  if (nextGroups.length !== groups.length) changed = true;
  return changed ? nextGroups : groups;
}

export function nextStoryExpiryMs(groups: ApiStoryGroup[]) {
  const now = Date.now();
  let next = Number.POSITIVE_INFINITY;

  for (const group of groups) {
    for (const story of group.stories) {
      const expires = storyExpiryMs(story);
      if (expires > now && expires < next) next = expires;
    }
  }

  return Number.isFinite(next) ? next : null;
}
