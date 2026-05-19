"use client";

import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { userProfileHref } from "@/lib/user-url";
import { useEffect, useState } from "react";

type ExplorePost = {
  id: string;
  mediaUrls: string[];
  caption: string | null;
  createdAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
  };
  _count: { likes: number; comments: number };
};

type ExploreResponse = {
  posts: ExplorePost[];
  nextOffset: number | null;
};

function mediaPreview(post: ExplorePost) {
  const media = post.mediaUrls[0];
  if (media) return media;
  return "linear-gradient(135deg, #1e1b4b, #7c3aed)";
}

async function fetchExplore(offset: number) {
  const url =
    offset > 0
      ? `/api/posts?filter=discover&offset=${encodeURIComponent(String(offset))}`
      : "/api/posts?filter=discover";
  const response = await fetch(url, { credentials: "include" });
  const data = (await response.json().catch(() => null)) as ExploreResponse | null;
  if (!response.ok || !data) throw new Error("Could not load explore feed.");
  return data;
}

export default function ExplorePage() {
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchExplore(0)
      .then((data) => {
        if (!alive) return;
        setPosts(data.posts ?? []);
        setNextOffset(data.nextOffset ?? null);
      })
      .catch(() => {
        if (!alive) return;
        setPosts([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function loadMore() {
    if (nextOffset == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchExplore(nextOffset);
      setPosts((current) => [...current, ...(data.posts ?? [])]);
      setNextOffset(data.nextOffset ?? null);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <AppShell>
      <div style={{ padding: "clamp(0.85rem, 3vw, 1.25rem) clamp(0.7rem, 3vw, 1.5rem)", height: "100%", overflowY: "auto" }}>
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Explore</h1>
        <p style={{ margin: "0.35rem 0 1.2rem", color: "var(--muted)", fontSize: "0.85rem" }}>
          Personalized discovery — trending engagement and creators you might not follow yet.
        </p>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading explore feed...</p>
        ) : posts.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No posts to show yet.</p>
        ) : (
          <>
            <div className="explore-grid">
              {posts.map((post) => (
                <article
                  key={post.id}
                  style={{
                    background: "var(--app-card)",
                    borderRadius: 14,
                    overflow: "hidden",
                    border: "1px solid var(--app-border)",
                  }}
                >
                  <Link href={`/post/${post.id}`} style={{ display: "block", textDecoration: "none" }}>
                    {mediaPreview(post).startsWith("linear-gradient") ? (
                      <div style={{ height: 180, background: mediaPreview(post) }} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaPreview(post)}
                        alt=""
                        style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                      />
                    )}
                  </Link>
                  <div style={{ padding: "0.72rem 0.8rem" }}>
                    <Link
                      href={userProfileHref(post.author)}
                      style={{ textDecoration: "none", fontWeight: 700, color: "var(--text)", fontSize: "0.82rem" }}
                    >
                      {post.author.displayName}
                    </Link>
                    <p style={{ margin: "0.35rem 0", color: "var(--muted)", fontSize: "0.78rem", lineHeight: 1.45 }}>
                      {(post.caption?.slice(0, 90) || "No caption")}
                    </p>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.72rem" }}>
                      {post._count.likes} likes • {post._count.comments} comments
                    </p>
                  </div>
                </article>
              ))}
            </div>

            {nextOffset != null ? (
              <div style={{ marginTop: "1rem", display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  style={{
                    border: "none",
                    borderRadius: 10,
                    padding: "0.7rem 1.25rem",
                    minHeight: 44,
                    background: "var(--app-accent)",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: loadingMore ? "not-allowed" : "pointer",
                    opacity: loadingMore ? 0.7 : 1,
                  }}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
