import "../../post-detail.css";
import { AppShell } from "@/components/app-shell";
import { PostDetailScreen } from "@/components/post-detail-screen";
import { absoluteUrl } from "@/lib/site-url";
import { prisma } from "@/lib/prisma";
import { isImageMediaUrl, isVideoMediaUrl, getMediaUrl } from "@/lib/media";
import type { Metadata } from "next";

const DESCRIPTION_MAX = 180;

function truncate(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

async function loadPostForMetadata(id: string) {
  try {
    return await prisma.post.findFirst({
      where: { id, audience: "PUBLIC", scheduledAt: null },
      select: {
        id: true,
        caption: true,
        mediaUrls: true,
        createdAt: true,
        author: { select: { username: true, displayName: true, avatarUrl: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });
  } catch {
    // Build-time / DB unavailable: fall back to default metadata.
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await loadPostForMetadata(id);

  if (!post) {
    return {
      title: "Post",
      description: "View this post on Linksy.",
      alternates: { canonical: `/post/${encodeURIComponent(id)}` },
      robots: { index: false, follow: false },
    };
  }

  const authorName = post.author.displayName || post.author.username;
  const caption = (post.caption ?? "").trim();
  const title = caption ? truncate(caption, 60) : `${authorName} on Linksy`;
  const description = caption
    ? truncate(caption, DESCRIPTION_MAX)
    : `${authorName} shared a post on Linksy. ${post._count.likes} likes · ${post._count.comments} comments.`;

  const firstVideo = post.mediaUrls.find((url) => isVideoMediaUrl(url));
  const canonical = `/post/${encodeURIComponent(post.id)}`;
  // Dynamic OG card — composed caption + author + branded background.
  // Falls back to the raw first image if the OG endpoint cannot render
  // (`ImageResponse` is a runtime-time render so worst case the static URL
  // below is used by crawlers that re-hit the original asset).
  const ogImage = absoluteUrl(`/api/og/post/${encodeURIComponent(post.id)}`);
  const firstImage = post.mediaUrls.find((url) => isImageMediaUrl(url));
  const rawImageFallback =
    (firstImage && absoluteUrl(getMediaUrl(firstImage) ?? firstImage))
    || (post.author.avatarUrl && absoluteUrl(getMediaUrl(post.author.avatarUrl) ?? post.author.avatarUrl))
    || undefined;
  const videoUrl = firstVideo ? absoluteUrl(getMediaUrl(firstVideo) ?? firstVideo) : null;

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
      // Composed dynamic card first; raw image as a secondary so older
      // crawlers that prefer the second tag (or any that error on the
      // dynamic URL) still get a meaningful preview.
      images: rawImageFallback
        ? [{ url: ogImage, width: 1200, height: 630 }, { url: rawImageFallback }]
        : [{ url: ogImage, width: 1200, height: 630 }],
      videos: videoUrl ? [{ url: videoUrl }] : undefined,
      publishedTime: post.createdAt.toISOString(),
      authors: [absoluteUrl(`/${encodeURIComponent(post.author.username)}`)],
    },
    twitter: {
      card: firstVideo ? "player" : "summary_large_image",
      title,
      description,
      images: [ogImage],
      creator: `@${post.author.username}`,
    },
  };
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await loadPostForMetadata(id);

  return (
    <AppShell>
      {/* JSON-LD: helps Google/Discord show rich result cards for the URL. */}
      {post ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SocialMediaPosting",
              "@id": absoluteUrl(`/post/${post.id}`),
              headline: (post.caption ?? "").slice(0, 110),
              articleBody: post.caption ?? "",
              datePublished: post.createdAt.toISOString(),
              author: {
                "@type": "Person",
                name: post.author.displayName || post.author.username,
                url: absoluteUrl(`/${encodeURIComponent(post.author.username)}`),
              },
              interactionStatistic: [
                {
                  "@type": "InteractionCounter",
                  interactionType: "https://schema.org/LikeAction",
                  userInteractionCount: post._count.likes,
                },
                {
                  "@type": "InteractionCounter",
                  interactionType: "https://schema.org/CommentAction",
                  userInteractionCount: post._count.comments,
                },
              ],
            }),
          }}
        />
      ) : null}
      <PostDetailScreen postId={id} />
    </AppShell>
  );
}
