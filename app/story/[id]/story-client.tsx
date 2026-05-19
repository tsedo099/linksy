"use client";

import { AppShell } from "@/components/app-shell";
import { StoryViewer } from "@/components/feed/feed-story-viewer";
import type { ApiStoryGroup } from "@/components/feed/feed-story-model";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type StoryDetail = {
  id: string;
  mediaUrl: string;
  mediaAlt?: string | null;
  caption: string | null;
  audience: string;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  viewedByMe: boolean;
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
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    allowStoryReplies?: boolean;
  };
  reactionCount?: number;
  myReaction?: string | null;
  playbackMode?: string | null;
  collaborators?: Array<{
    userId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  }>;
};

export function StoryClient({ storyId }: { storyId: string }) {
  const router = useRouter();
  const [story, setStory] = useState<StoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storyId) {
      setError("Invalid story id.");
      setLoading(false);
      return;
    }

    let alive = true;
    fetch(`/api/stories/${encodeURIComponent(storyId)}`)
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as { story?: StoryDetail; error?: string } | null;
        if (!response.ok || !data?.story) {
          throw new Error(data?.error ?? "Could not load story.");
        }
        if (!alive) return;
        setStory(data.story);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Could not load story.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [storyId]);

  const storyGroup = useMemo<ApiStoryGroup | null>(() => {
    if (!story) return null;
    return {
      authorId: story.author.id,
      author: story.author,
      allViewed: Boolean(story.viewedByMe),
      isCloseCircle: story.audience === "CLOSE_CIRCLE",
      stories: [{
        id: story.id,
        mediaUrl: story.mediaUrl,
        mediaAlt: story.mediaAlt,
        caption: story.caption,
        audience: story.audience,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        viewedByMe: story.viewedByMe,
        viewCount: story.viewCount,
        playbackMode: story.playbackMode,
        collaborators: story.collaborators ?? [],
        author: story.author,
        reactionCount: story.reactionCount,
        myReaction: story.myReaction,
      }],
    };
  }, [story]);

  return (
    <AppShell>
      <div style={{ height: "100%", overflowY: "auto", padding: "1.25rem 1.5rem", display: "grid", placeItems: "start center" }}>
        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading story...</p>
        ) : error || !story ? (
          <p style={{ color: "#ef4444" }}>{error ?? "Story unavailable."}</p>
        ) : storyGroup ? (
          <StoryViewer
            groups={[storyGroup]}
            startIdx={0}
            onClose={() => {
              if (window.history.length > 1) router.back();
              else router.push("/home");
            }}
          />
        ) : (
          <p style={{ color: "#ef4444" }}>Story unavailable.</p>
        )}
      </div>
    </AppShell>
  );
}
