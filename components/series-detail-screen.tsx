"use client";

import { AppShell } from "@/components/app-shell";
import { displayMediaSrc, getMediaUrl } from "@/lib/media";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type SeriesPost = {
  id: string;
  mediaUrls: string[];
  caption: string | null;
  seriesPosition: number | null;
  _count: { likes: number; comments: number };
  author: { id: string; username: string; displayName: string };
};

export function SeriesDetailScreen() {
  const params = useParams<{ id: string }>();
  const rawId = typeof params?.id === "string" ? params.id : "";
  const [title, setTitle] = useState<string | null>(null);
  const [posts, setPosts] = useState<SeriesPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rawId) {
      setLoading(false);
      setError("Missing series");
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/post-series/${encodeURIComponent(rawId)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Not found"))))
      .then((data) => {
        if (!alive) return;
        setTitle(data?.series?.title ?? null);
        setPosts(Array.isArray(data?.posts) ? data.posts : []);
      })
      .catch(() => {
        if (alive) {
          setError("This album is unavailable.");
          setPosts([]);
          setTitle(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [rawId]);

  return (
    <AppShell>
      <div style={{ padding: "1.25rem 1.5rem", height: "100%", overflowY: "auto" }}>
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>{title ?? "Album"}</h1>
        <p style={{ margin: "0.35rem 0 1.2rem", color: "var(--muted)", fontSize: "0.85rem" }}>
          Posts in this album, in order.
        </p>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        ) : error ? (
          <p style={{ color: "var(--muted)" }}>{error}</p>
        ) : posts.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No posts in this album yet.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "0.9rem",
            }}
          >
            {posts.map((post) => {
              const raw = post.mediaUrls[0];
              const media = raw ? (getMediaUrl(raw) ?? raw) : null;
              const src = media ? (displayMediaSrc(media) ?? media) : null;
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
                  <Link href={`/post/${post.id}`} style={{ display: "block", textDecoration: "none" }}>
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt="" style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
                    ) : (
                      <div style={{ height: 180, background: "linear-gradient(135deg, #1e1b4b, #7c3aed)" }} />
                    )}
                  </Link>
                  <div style={{ padding: "0.72rem 0.8rem" }}>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.7rem" }}>
                      #{post.seriesPosition != null ? post.seriesPosition + 1 : "—"}
                    </p>
                    <p style={{ margin: "0.35rem 0", color: "var(--muted)", fontSize: "0.78rem", lineHeight: 1.45 }}>
                      {post.caption?.slice(0, 90) || "No caption"}
                    </p>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.72rem" }}>
                      {post._count.likes} likes · {post._count.comments} comments
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
