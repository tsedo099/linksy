import { notFound } from "next/navigation";
import { CategoryClient } from "./category-client";
import { findPostCategoryBySlug, POST_CATEGORIES } from "@/lib/post-categories";
import { absoluteUrl } from "@/lib/site-url";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";

/** Pre-render the canonical category pages at build time. */
export function generateStaticParams() {
  return POST_CATEGORIES.map((category) => ({ slug: category.slug }));
}

async function countCategoryPosts(slug: string): Promise<number> {
  try {
    return await prisma.post.count({ where: { category: slug, audience: "PUBLIC" } });
  } catch {
    return 0;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = findPostCategoryBySlug(slug);
  if (!category) {
    return { title: "Category", robots: { index: false, follow: false } };
  }

  const postCount = await countCategoryPosts(category.slug);
  const title = `${category.label}`;
  const description = postCount > 0
    ? `${postCount} public posts in ${category.label} on Linksy. ${category.description}`
    : `Browse ${category.label} on Linksy. ${category.description}`;
  const canonical = `/category/${encodeURIComponent(category.slug)}`;

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
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = findPostCategoryBySlug(slug);
  if (!category) {
    notFound();
  }

  const canonical = `/category/${encodeURIComponent(category.slug)}`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: category.label,
            description: category.description,
            url: absoluteUrl(canonical),
          }),
        }}
      />
      <CategoryClient
        slug={category.slug}
        label={category.label}
        description={category.description}
        emoji={category.emoji}
      />
    </>
  );
}
