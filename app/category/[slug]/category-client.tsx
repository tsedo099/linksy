"use client";

import { AppShell } from "@/components/app-shell";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { displayMediaSrc, isImageMediaUrl } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";

type CategoryPost = {
  id: string;
  mediaUrls: string[];
  caption: string | null;
  createdAt: string;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null; isVerified: boolean };
  likes: number;
  comments: number;
};

export function CategoryClient({
  slug,
  label,
  description,
  emoji,
}: {
  slug: string;
  label: string;
  description: string;
  emoji: string;
}) {
  const [posts, setPosts] = useState<CategoryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/categories/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        if (!data) {
          setError("Could not load this category.");
          return;
        }
        setPosts(data.posts ?? []);
      })
      .catch(() => {
        if (alive) setError("Could not load this category.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [slug]);

  return (
    <AppShell>
      <div style={{ padding: "clamp(0.85rem, 3vw, 1.4rem) clamp(0.7rem, 3vw, 1.6rem)", height: "100%", overflowY: "auto" }}>
        <header style={{ marginBottom: "1.4rem" }}>
          <span style={{ fontSize: "2.4rem", lineHeight: 1 }} aria-hidden>{emoji}</span>
          <h1 style={{ margin: "0.4rem 0 0.25rem", fontSize: "1.6rem" }}>{label}</h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.92rem", maxWidth: 640 }}>{description}</p>
        </header>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading posts…</p>
        ) : error ? (
          <p style={{ color: "#ef4444" }}>{error}</p>
        ) : posts.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No posts in this category yet.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.95rem" }}>
            {posts.map((post) => {
              const cover = post.mediaUrls.find(isImageMediaUrl);
              const src = cover ? (displayMediaSrc(cover) ?? cover) : null;
              return (
                <article
                  key={post.id}
                  style={{
                    background: "var(--app-card)",
                    borderRadius: 14,
                    overflow: "hidden",
                    border: "1px solid var(--app-border)",
                  }}
                >
                  <Link href={`/post/${encodeURIComponent(post.id)}`} style={{ display: "block", textDecoration: "none" }}>
                    {src ? (
                      <Image src={src} alt="" width={400} height={180} sizes="(max-width: 768px) 100vw, 400px" style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} unoptimized={shouldUnoptimizeNextImageSrc(src)} />
                    ) : (
                      <div style={{ height: 180, background: "linear-gradient(135deg, #1e1b4b, #7c3aed)", display: "grid", placeItems: "center", fontSize: "2.5rem" }}>
                        {emoji}
                      </div>
                    )}
                    <div style={{ padding: "0.72rem 0.85rem" }}>
                      <p style={{ margin: "0 0 0.25rem", fontWeight: 700, fontSize: "0.86rem", color: "var(--text)" }}>
                        {post.author.displayName}
                        {post.author.isVerified ? <span style={{ color: "var(--app-accent)", marginLeft: 4 }}>✓</span> : null}
                      </p>
                      <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.78rem", lineHeight: 1.45 }}>
                        {post.caption?.slice(0, 90) || "No caption"}
                      </p>
                      <p style={{ margin: "0.45rem 0 0", color: "var(--muted)", fontSize: "0.72rem" }}>
                        {post.likes} likes · {post.comments} comments
                      </p>
                    </div>
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
