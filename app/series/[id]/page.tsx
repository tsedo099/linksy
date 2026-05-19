import { SeriesDetailScreen } from "@/components/series-detail-screen";
import { absoluteUrl } from "@/lib/site-url";
import { prisma } from "@/lib/prisma";
import { getMediaUrl, isImageMediaUrl } from "@/lib/media";
import type { Metadata } from "next";

async function loadSeriesForMetadata(id: string) {
  try {
    const series = await prisma.postSeries.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { username: true, displayName: true, avatarUrl: true } },
        posts: {
          where: { audience: "PUBLIC", scheduledAt: null },
          orderBy: { seriesPosition: "asc" },
          take: 4,
          select: { id: true, mediaUrls: true, caption: true },
        },
      },
    });
    if (!series) return null;
    return series;
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
  const series = await loadSeriesForMetadata(id);

  if (!series) {
    return {
      title: "Album",
      description: "Browse this album on Linksy.",
      alternates: { canonical: `/series/${encodeURIComponent(id)}` },
      robots: { index: false, follow: false },
    };
  }

  const authorName = series.user.displayName || series.user.username;
  const title = `${series.title} · Album by ${authorName}`;
  const count = series.posts.length;
  const description = count
    ? `${count} post${count === 1 ? "" : "s"} in this album by ${authorName} on Linksy.`
    : `Album by ${authorName} on Linksy.`;

  const cover = series.posts
    .flatMap((p) => p.mediaUrls)
    .find((url) => isImageMediaUrl(url));
  const ogImage = cover
    ? absoluteUrl(getMediaUrl(cover) ?? cover)
    : series.user.avatarUrl
      ? absoluteUrl(getMediaUrl(series.user.avatarUrl) ?? series.user.avatarUrl)
      : undefined;

  const canonical = `/series/${encodeURIComponent(series.id)}`;

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
      images: ogImage ? [{ url: ogImage }] : undefined,
      publishedTime: series.createdAt.toISOString(),
      modifiedTime: series.updatedAt.toISOString(),
      authors: [absoluteUrl(`/${encodeURIComponent(series.user.username)}`)],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
      creator: `@${series.user.username}`,
    },
  };
}

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = await loadSeriesForMetadata(id);

  return (
    <>
      {series ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "CollectionPage",
              name: series.title,
              url: absoluteUrl(`/series/${series.id}`),
              dateCreated: series.createdAt.toISOString(),
              dateModified: series.updatedAt.toISOString(),
              author: {
                "@type": "Person",
                name: series.user.displayName || series.user.username,
                url: absoluteUrl(`/${encodeURIComponent(series.user.username)}`),
              },
              hasPart: series.posts.map((post) => ({
                "@type": "SocialMediaPosting",
                "@id": absoluteUrl(`/post/${post.id}`),
                url: absoluteUrl(`/post/${post.id}`),
                headline: (post.caption ?? "").slice(0, 110),
              })),
            }),
          }}
        />
      ) : null}
      <SeriesDetailScreen />
    </>
  );
}
