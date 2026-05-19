import { StoryClient } from "./story-client";
import { absoluteUrl } from "@/lib/site-url";
import { prisma } from "@/lib/prisma";
import { getMediaUrl, isVideoMediaUrl } from "@/lib/media";
import type { Metadata } from "next";

async function loadStoryForMetadata(id: string) {
  try {
    return await prisma.story.findFirst({
      where: {
        id,
        audience: "PUBLIC",
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        mediaUrl: true,
        caption: true,
        mediaAlt: true,
        createdAt: true,
        expiresAt: true,
        author: { select: { username: true, displayName: true, avatarUrl: true } },
      },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const story = await loadStoryForMetadata(id);

  if (!story) {
    return {
      title: "Story",
      description: "View this story on Linksy.",
      alternates: { canonical: `/story/${encodeURIComponent(id)}` },
      // Stories are time-limited; once expired we don't want them indexed.
      robots: { index: false, follow: false },
    };
  }

  const authorName = story.author.displayName || story.author.username;
  const caption = (story.caption ?? "").replace(/\s+/g, " ").trim();
  const title = caption ? `${caption.slice(0, 60)} · ${authorName}'s story` : `${authorName}'s story`;
  const description = caption
    ? caption.slice(0, 180)
    : `Watch ${authorName}'s story on Linksy.`;

  const mediaAbs = absoluteUrl(getMediaUrl(story.mediaUrl) ?? story.mediaUrl);
  const isVideo = isVideoMediaUrl(story.mediaUrl);
  const canonical = `/story/${encodeURIComponent(story.id)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title,
      description,
      url: absoluteUrl(canonical),
      siteName: "Linksy",
      images: isVideo ? undefined : [{ url: mediaAbs, alt: story.mediaAlt ?? undefined }],
      videos: isVideo ? [{ url: mediaAbs }] : undefined,
      publishedTime: story.createdAt.toISOString(),
      expirationTime: story.expiresAt.toISOString(),
      authors: [absoluteUrl(`/${encodeURIComponent(story.author.username)}`)],
    },
    twitter: {
      card: isVideo ? "player" : "summary_large_image",
      title,
      description,
      images: isVideo ? undefined : [mediaAbs],
      creator: `@${story.author.username}`,
    },
    // Stories expire; tell crawlers not to keep them in the index past expiry.
    other: {
      "og:ttl": Math.max(60, Math.floor((story.expiresAt.getTime() - Date.now()) / 1000)).toString(),
    },
  };
}

export default async function StoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StoryClient storyId={id} />;
}
