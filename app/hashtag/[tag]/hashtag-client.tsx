"use client";

import { AppShell } from "@/components/app-shell";
import Image from "next/image";
import Link from "next/link";
import { userProfileHref } from "@/lib/user-url";
import { useEffect, useState } from "react";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";

type HashtagPost = {
  id: string;
  mediaUrls: string[];
  caption: string | null;
  author: { id: string; username: string; displayName: string };
  _count: { likes: number; comments: number };
};

export function HashtagClient({ tag }: { tag: string }) {
  const [posts, setPosts] = useState<HashtagPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tag) {
      setLoading(false);
      setPosts([]);
      return;
    }
    let alive = true;
    fetch(`/api/hashtags/${encodeURIComponent(tag)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!alive) return;
        setPosts(data?.posts ?? []);
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
  }, [tag]);

  return (
    <AppShell>
      <div style={{ padding: "clamp(0.85rem, 3vw, 1.25rem) clamp(0.7rem, 3vw, 1.5rem)", height: "100%", overflowY: "auto" }}>
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>#{tag || "hashtag"}</h1>
        <p style={{ margin: "0.35rem 0 1.2rem", color: "var(--muted)", fontSize: "0.85rem" }}>
          Posts using this hashtag.
        </p>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Loading hashtag posts...</p>
        ) : posts.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No posts found for this hashtag.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.9rem" }}>
            {posts.map((post) => {
              const media = post.mediaUrls[0];
              return (
                <article key={post.id} style={{ background: "var(--app-card)", borderRadius: 14, overflow: "hidden", border: "1px solid var(--app-border)" }}>
                  <Link href={`/post/${post.id}`} style={{ display: "block", textDecoration: "none" }}>
                    {media ? (
                      <Image src={media} alt="" width={400} height={180} sizes="(max-width: 768px) 100vw, 400px" style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} unoptimized={shouldUnoptimizeNextImageSrc(media)} />
                    ) : (
                      <div style={{ height: 180, background: "linear-gradient(135deg, #1e1b4b, #7c3aed)" }} />
                    )}
                  </Link>
                  <div style={{ padding: "0.72rem 0.8rem" }}>
                    <Link href={userProfileHref(post.author)} style={{ textDecoration: "none", fontWeight: 700, color: "var(--text)", fontSize: "0.82rem" }}>
                      {post.author.displayName}
                    </Link>
                    <p style={{ margin: "0.35rem 0", color: "var(--muted)", fontSize: "0.78rem", lineHeight: 1.45 }}>
                      {post.caption?.slice(0, 90) || "No caption"}
                    </p>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.72rem" }}>
                      {post._count.likes} likes • {post._count.comments} comments
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
