import { scrubFeedCaptionForViewer } from "@/lib/caption-display";

/**
 * Per-viewer flags for post engagement privacy (hide like counts, turn off comments).
 */
export function withPostViewerFields<
  T extends { authorId: string; hideLikes?: boolean; allowComments?: boolean },
>(post: T, viewerUserId: string): T & { likesHidden: boolean; commentsEnabled: boolean } {
  const isAuthor = post.authorId === viewerUserId;
  const base = {
    ...post,
    likesHidden: Boolean(post.hideLikes) && !isAuthor,
    commentsEnabled: post.allowComments !== false || isAuthor,
  } as T & { likesHidden: boolean; commentsEnabled: boolean };

  if ("caption" in base) {
    return {
      ...base,
      caption: scrubFeedCaptionForViewer(
        (base as { caption?: string | null }).caption ?? null,
      ),
    } as typeof base;
  }

  return base;
}
