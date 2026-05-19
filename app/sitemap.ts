import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";
import { prisma } from "@/lib/prisma";
import { POST_CATEGORIES } from "@/lib/post-categories";
import { RESERVED_USERNAME_PATHS } from "@/lib/user-url";

export const revalidate = 3600; // regenerate the sitemap at most once per hour

/** Caps so a single sitemap file stays well under the 50k-URL / 50MB limits. */
const TOP_USERS_LIMIT = 1_000;
const RECENT_POSTS_LIMIT = 5_000;
const TOP_HASHTAGS_LIMIT = 500;

type SitemapEntry = MetadataRoute.Sitemap[number];

function entry(
  path: string,
  lastModified: Date | string | undefined,
  changeFrequency: SitemapEntry["changeFrequency"],
  priority: number,
): SitemapEntry {
  return {
    url: absoluteUrl(path),
    lastModified: lastModified ? new Date(lastModified) : undefined,
    changeFrequency,
    priority,
  };
}

async function loadTopUsers(): Promise<SitemapEntry[]> {
  try {
    const users = await prisma.user.findMany({
      where: {
        // Skip pending-deletion accounts; their profile pages 404.
        accountDeletionRequestedAt: null,
        // Only profiles that opted public follow counts (proxy for "wants visibility").
        showFollowers: true,
      },
      orderBy: [{ creatorXP: "desc" }, { createdAt: "desc" }],
      take: TOP_USERS_LIMIT,
      select: { username: true, updatedAt: true },
    });
    return users
      .filter((u) => !RESERVED_USERNAME_PATHS.has(u.username.toLowerCase()))
      .map((u) => entry(`/${encodeURIComponent(u.username)}`, u.updatedAt, "weekly", 0.6));
  } catch {
    return [];
  }
}

async function loadRecentPosts(): Promise<SitemapEntry[]> {
  try {
    const posts = await prisma.post.findMany({
      where: {
        audience: "PUBLIC",
        // Filter out scheduled / blocked / pending-author cases on the DB side
        // so the sitemap never lists a URL that 404s.
        scheduledAt: null,
        author: { accountDeletionRequestedAt: null },
      },
      orderBy: { createdAt: "desc" },
      take: RECENT_POSTS_LIMIT,
      select: { id: true, createdAt: true },
    });
    return posts.map((p) => entry(`/post/${encodeURIComponent(p.id)}`, p.createdAt, "weekly", 0.7));
  } catch {
    return [];
  }
}

async function loadTopHashtags(): Promise<SitemapEntry[]> {
  try {
    const tags = await prisma.hashtag.findMany({
      where: { postCount: { gt: 0 } },
      orderBy: { postCount: "desc" },
      take: TOP_HASHTAGS_LIMIT,
      select: { name: true, createdAt: true },
    });
    return tags.map((t) => entry(`/hashtag/${encodeURIComponent(t.name)}`, t.createdAt, "daily", 0.4));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: SitemapEntry[] = [
    entry("/", now, "daily", 1.0),
    entry("/pricing", now, "monthly", 0.7),
    entry("/legal/privacy", now, "yearly", 0.3),
    entry("/legal/terms", now, "yearly", 0.3),
  ];

  const categoryEntries: SitemapEntry[] = POST_CATEGORIES.map((c) =>
    entry(`/category/${c.slug}`, now, "daily", 0.5),
  );

  const [users, posts, hashtags] = await Promise.all([
    loadTopUsers(),
    loadRecentPosts(),
    loadTopHashtags(),
  ]);

  return [...staticEntries, ...categoryEntries, ...users, ...posts, ...hashtags];
}
