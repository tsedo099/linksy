import { HashtagClient } from "./hashtag-client";
import { absoluteUrl } from "@/lib/site-url";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

function cleanTag(raw: string): string {
  return decodeURIComponent(raw).replace(/^#/, "").trim();
}

async function loadHashtagForMetadata(name: string) {
  if (!name) return null;
  try {
    return await prisma.hashtag.findUnique({
      where: { name: name.toLowerCase() },
      select: { name: true, postCount: true },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag: rawTag } = await params;
  const tag = cleanTag(rawTag);
  if (!tag) {
    return { title: "Hashtag", robots: { index: false, follow: false } };
  }

  const row = await loadHashtagForMetadata(tag);
  const postCount = row?.postCount ?? 0;
  const title = `#${tag}`;
  const description = row
    ? `${postCount} posts tagged #${tag} on Linksy.`
    : `Posts tagged #${tag} on Linksy.`;
  const canonical = `/hashtag/${encodeURIComponent(tag)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title,
      description,
      url: absoluteUrl(canonical),
      siteName: "Linksy",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function HashtagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag: rawTag } = await params;
  const tag = cleanTag(rawTag);
  const row = await loadHashtagForMetadata(tag);
  const canonical = `/hashtag/${encodeURIComponent(tag)}`;

  return (
    <>
      {row ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "CollectionPage",
              name: `#${tag}`,
              url: absoluteUrl(canonical),
              description: `${row.postCount} posts tagged #${tag} on Linksy.`,
            }),
          }}
        />
      ) : null}
      <HashtagClient tag={tag} />
    </>
  );
}
