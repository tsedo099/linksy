export const STORY_TTL_MS = 24 * 60 * 60 * 1000;

export function activeStoryWhere(now = new Date()) {
  return {
    expiresAt: { gt: now },
    createdAt: { gt: new Date(now.getTime() - STORY_TTL_MS) },
  };
}

export function visibleStoryWhere(viewerId: string) {
  return {
    OR: [
      { authorId: viewerId },
      { audience: "PUBLIC" },
      {
        audience: "FOLLOWERS",
        author: { followers: { some: { followerId: viewerId } } },
      },
      {
        audience: "CLOSE_CIRCLE",
        author: { closeCircle: { some: { targetId: viewerId } } },
      },
    ],
  };
}

export function visibleActiveStoryWhere(viewerId: string, now = new Date()) {
  return {
    ...activeStoryWhere(now),
    ...visibleStoryWhere(viewerId),
  };
}
