"use client";

import { AppShell } from "@/components/app-shell";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { displayMediaSrc } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import { userProfileHref } from "@/lib/user-url";

type SearchUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

type SearchPost = {
  id: string;
  caption: string | null;
  mediaUrls: string[];
  author: { id: string; username: string; displayName: string };
  _count: { likes: number; comments: number };
};

type HistoryRow = { id: string; query: string; searchedAt: string };

function navigateSearch(
  router: ReturnType<typeof useRouter>,
  draft: {
    q: string;
    from: string;
    to: string;
    mediaType: string;
    minLikes: string;
    minComments: string;
    minEngagement: string;
  },
) {
  const trimmed = draft.q.trim();
  const next = new URLSearchParams();

  if (trimmed.length) next.set("q", trimmed);
  else {
    router.replace("/search");
    return;
  }

  if (draft.from.trim()) next.set("from", draft.from.trim());
  if (draft.to.trim()) next.set("to", draft.to.trim());
  if (draft.mediaType && draft.mediaType !== "any") next.set("mediaType", draft.mediaType);
  if (draft.minLikes.trim()) next.set("minLikes", draft.minLikes.trim());
  if (draft.minComments.trim()) next.set("minComments", draft.minComments.trim());
  if (draft.minEngagement.trim()) next.set("minEngagement", draft.minEngagement.trim());

  router.replace(`/search?${next.toString()}`);
}

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const spKey = searchParams.toString();

  const qCommitted = useMemo(() => (searchParams.get("q") ?? "").trim(), [searchParams, spKey]);

  const committedFilterQuery = useMemo(() => {
    const out = new URLSearchParams(searchParams.toString());
    out.delete("q");
    out.delete("focus");
    return out.toString();
  }, [searchParams, spKey]);

  const [draftInput, setDraftInput] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [draftMedia, setDraftMedia] = useState("any");
  const [draftMinLikes, setDraftMinLikes] = useState("");
  const [draftMinComments, setDraftMinComments] = useState("");
  const [draftMinEngagement, setDraftMinEngagement] = useState("");

  const queryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchParams.get("focus") !== "1") return;

    queueMicrotask(() => queryInputRef.current?.focus());

    const next = new URLSearchParams(searchParams.toString());
    next.delete("focus");
    const qs = next.toString();
    router.replace(qs.length ? `/search?${qs}` : "/search", { scroll: false });
  }, [router, searchParams, spKey]);

  useEffect(() => {
    setDraftInput(searchParams.get("q") ?? "");
    setDraftFrom(searchParams.get("from") ?? "");
    setDraftTo(searchParams.get("to") ?? "");
    setDraftMedia(searchParams.get("mediaType") ?? "any");
    setDraftMinLikes(searchParams.get("minLikes") ?? "");
    setDraftMinComments(searchParams.get("minComments") ?? "");
    setDraftMinEngagement(searchParams.get("minEngagement") ?? "");
  }, [searchParams, spKey]);

  const [users, setUsers] = useState<SearchUser[]>([]);
  const [posts, setPosts] = useState<SearchPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  async function reloadHistory() {
    try {
      const response = await fetch("/api/search/history", { credentials: "include" });
      if (!response.ok) return;
      const data = await response.json() as { history?: HistoryRow[] };
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch {
      setHistory([]);
    }
  }

  useEffect(() => {
    reloadHistory().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!qCommitted) {
      setUsers([]);
      setPosts([]);
      return;
    }

    let alive = true;
    setLoading(true);
    const qp = new URLSearchParams(committedFilterQuery || undefined);
    qp.set("q", qCommitted);
    Promise.all([
      fetch(`/api/users/search?q=${encodeURIComponent(qCommitted)}`, { credentials: "include" }).then((response) =>
        response.ok ? response.json() : { users: [] },
      ),
      fetch(`/api/search/posts?${qp.toString()}`, { credentials: "include" }).then((response) =>
        response.ok ? response.json() : { posts: [] },
      ),
    ])
      .then(([usersData, postsData]) => {
        if (!alive) return;
        setUsers(Array.isArray(usersData?.users) ? usersData.users : []);
        setPosts(Array.isArray(postsData?.posts) ? postsData.posts : []);
        reloadHistory().catch(() => undefined);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [qCommitted, committedFilterQuery]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    navigateSearch(router, {
      q: draftInput,
      from: draftFrom,
      to: draftTo,
      mediaType: draftMedia,
      minLikes: draftMinLikes,
      minComments: draftMinComments,
      minEngagement: draftMinEngagement,
    });
  }

  async function deleteHistory(id: string) {
    await fetch(`/api/search/history?id=${encodeURIComponent(id)}`, {
      credentials: "include",
      method: "DELETE",
    });
    reloadHistory();
  }

  async function clearHistory() {
    await fetch("/api/search/history", { credentials: "include", method: "DELETE" });
    reloadHistory();
  }

  const inputStyle = {
    width: "100%",
    maxWidth: 560,
    border: "1px solid var(--app-border)",
    background: "var(--app-card)",
    color: "var(--text)",
    borderRadius: 10,
    padding: "0.62rem 0.8rem",
    outline: "none",
  };

  const smallInputStyle = { ...inputStyle, maxWidth: "100%", padding: "0.5rem 0.62rem", fontSize: "0.82rem" };

  function openHistoryChip(row: HistoryRow) {
    setDraftInput(row.query);
    const next = new URLSearchParams(committedFilterQuery || undefined);
    next.set("q", row.query);
    router.replace(`/search?${next.toString()}`);
  }

  const labelStyle = { display: "block", marginBottom: 4, fontSize: "0.72rem", color: "var(--muted)", fontWeight: 700 };

  return (
    <AppShell>
      <div style={{ padding: "clamp(0.85rem, 3vw, 1.25rem) clamp(0.7rem, 3vw, 1.5rem)", height: "100%", overflowY: "auto" }}>
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Search</h1>

        {!qCommitted ? (
          <p style={{ margin: "0.45rem 0 0", color: "var(--muted)", fontSize: "0.82rem", maxWidth: 640 }}>
            Recent searches sync to your account. Post filters apply to captions, locations, people, dates, engagement, and media type.
          </p>
        ) : null}

        <form onSubmit={onSubmit} style={{ marginTop: "0.8rem", marginBottom: "1rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end", maxWidth: 720 }}>
            <div style={{ flex: "1 1 260px" }}>
              <label htmlFor="search-q" style={labelStyle}>Query</label>
              <input
                id="search-q"
                ref={queryInputRef}
                value={draftInput}
                onChange={(e) => setDraftInput(e.target.value)}
                placeholder="Search users, captions, hashtags..."
                style={{ ...inputStyle, maxWidth: "100%", width: "100%" }}
              />
            </div>
            <button
              type="submit"
              style={{
                padding: "0.62rem 1rem",
                borderRadius: 10,
                border: "none",
                background: "var(--app-accent)",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Search
            </button>
          </div>

          <details style={{ marginTop: "0.85rem", maxWidth: 720 }}>
            <summary style={{ cursor: "pointer", fontSize: "0.82rem", fontWeight: 700, color: "var(--text)" }}>
              Advanced post filters
            </summary>
            <div
              style={{
                marginTop: "0.65rem",
                padding: "0.85rem",
                borderRadius: 12,
                border: "1px solid var(--app-border)",
                background: "var(--app-card-soft)",
                display: "grid",
                gap: "0.62rem",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              }}
            >
              <div style={{ gridColumn: "span 2" }}>
                <label htmlFor="search-from" style={labelStyle}>From (date)</label>
                <input
                  id="search-from"
                  type="date"
                  value={draftFrom}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  style={{ ...smallInputStyle, background: "var(--app-card)" }}
                />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label htmlFor="search-to" style={labelStyle}>To (date)</label>
                <input
                  id="search-to"
                  type="date"
                  value={draftTo}
                  onChange={(e) => setDraftTo(e.target.value)}
                  style={{ ...smallInputStyle, background: "var(--app-card)" }}
                />
              </div>
              <div>
                <label htmlFor="search-media" style={labelStyle}>Media type</label>
                <select
                  id="search-media"
                  value={draftMedia}
                  onChange={(e) => setDraftMedia(e.target.value)}
                  style={{ ...smallInputStyle, width: "100%" }}
                >
                  <option value="any">Any</option>
                  <option value="image">Image first</option>
                  <option value="video">Video first</option>
                </select>
              </div>
              <div>
                <label htmlFor="search-minlikes" style={labelStyle}>Min likes</label>
                <input
                  id="search-minlikes"
                  inputMode="numeric"
                  value={draftMinLikes}
                  onChange={(e) => setDraftMinLikes(e.target.value)}
                  placeholder="e.g. 5"
                  style={{ ...smallInputStyle, background: "var(--app-card)" }}
                />
              </div>
              <div>
                <label htmlFor="search-mincomments" style={labelStyle}>Min comments</label>
                <input
                  id="search-mincomments"
                  inputMode="numeric"
                  value={draftMinComments}
                  onChange={(e) => setDraftMinComments(e.target.value)}
                  placeholder="e.g. 1"
                  style={{ ...smallInputStyle, background: "var(--app-card)" }}
                />
              </div>
              <div>
                <label htmlFor="search-minengagement" style={labelStyle}>Min engagement</label>
                <input
                  id="search-minengagement"
                  inputMode="numeric"
                  value={draftMinEngagement}
                  onChange={(e) => setDraftMinEngagement(e.target.value)}
                  placeholder="likes + 2×comments"
                  style={{ ...smallInputStyle, background: "var(--app-card)" }}
                />
              </div>
            </div>
          </details>
        </form>

        {!qCommitted ? (
          <section style={{ marginBottom: "1.35rem", maxWidth: 720 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
              <h2 style={{ margin: 0, fontSize: "0.95rem" }}>Recent searches</h2>
              {history.length ? (
                <button
                  type="button"
                  onClick={clearHistory}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--muted)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                  }}
                >
                  Clear all
                </button>
              ) : null}
            </div>
            {history.length === 0 ? (
              <p style={{ margin: "0.4rem 0 0", color: "var(--muted)", fontSize: "0.82rem" }}>No searches yet — run a query to save it here.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: "0.55rem 0 0", display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
                {history.map((row) => (
                  <li
                    key={row.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      background: "var(--app-card)",
                      border: "1px solid var(--app-border)",
                      borderRadius: 999,
                      padding: "0.28rem 0.52rem",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openHistoryChip(row)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--text)",
                        cursor: "pointer",
                        fontSize: "0.79rem",
                        fontWeight: 600,
                      }}
                    >
                      {row.query}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${row.query}`}
                      onClick={() => deleteHistory(row.id)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "var(--muted)",
                        cursor: "pointer",
                        fontSize: "0.9rem",
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {!qCommitted ? (
          <p style={{ color: "var(--muted)" }}>Type a keyword above, then Search — or pick a recent search.</p>
        ) : loading ? (
          <p style={{ color: "var(--muted)" }}>Searching for &quot;{qCommitted}&quot;...</p>
        ) : (
          <>
            {committedFilterQuery.length ? (
              <p style={{ fontSize: "0.74rem", color: "var(--muted)", margin: "0 0 1rem" }}>
                Post filters active:{" "}
                {[...new URLSearchParams(committedFilterQuery).entries()].map(([k, v]) => `${k}=${v}`).join(" · ")}
              </p>
            ) : null}

            <section style={{ marginBottom: "1.25rem" }}>
              <h2 style={{ margin: "0 0 0.55rem", fontSize: "0.95rem" }}>Users ({users.length})</h2>
              {users.length === 0 ? (
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.82rem" }}>No users found.</p>
              ) : (
                <div style={{ display: "grid", gap: "0.45rem", maxWidth: 640 }}>
                  {users.map((user) => (
                    <Link
                      key={user.id}
                      href={userProfileHref(user)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.65rem",
                        background: "var(--app-card)",
                        border: "1px solid var(--app-border)",
                        borderRadius: 10,
                        padding: "0.52rem 0.62rem",
                        textDecoration: "none",
                      }}
                    >
                      {user.avatarUrl ? (() => {
                        const src = displayMediaSrc(user.avatarUrl) ?? user.avatarUrl;
                        return <Image src={src} alt="" width={34} height={34} sizes="34px" style={{ borderRadius: "50%", objectFit: "cover" }} unoptimized={shouldUnoptimizeNextImageSrc(src)} />;
                      })() : (
                        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, color: "var(--text)", fontSize: "0.82rem", fontWeight: 700 }}>{user.displayName}</p>
                        <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.75rem" }}>@{user.username}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 style={{ margin: "0 0 0.55rem", fontSize: "0.95rem" }}>Posts ({posts.length})</h2>
              {posts.length === 0 ? (
                <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.82rem" }}>No posts match these filters.</p>
              ) : (
                <div style={{ display: "grid", gap: "0.9rem", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
                  {posts.map((post) => (
                    <article
                      key={post.id}
                      style={{ background: "var(--app-card)", borderRadius: 14, overflow: "hidden", border: "1px solid var(--app-border)" }}
                    >
                      <Link href={`/post/${post.id}`} style={{ display: "block", textDecoration: "none" }}>
                        {post.mediaUrls[0] ? (() => {
                          const src = displayMediaSrc(post.mediaUrls[0]) ?? post.mediaUrls[0];
                          return <Image src={src} alt="" width={400} height={180} sizes="(max-width: 768px) 100vw, 400px" style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} unoptimized={shouldUnoptimizeNextImageSrc(src)} />;
                        })() : (
                          <div style={{ height: 180, background: "linear-gradient(135deg, #0f172a, #334155)" }} />
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
                          {post.caption?.slice(0, 90) || "No caption"}
                        </p>
                        <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.72rem" }}>
                          {post._count.likes} likes • {post._count.comments} comments
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<AppShell><div style={{ padding: "1.5rem", color: "var(--muted)" }}>Loading search…</div></AppShell>}>
      <SearchPageInner />
    </Suspense>
  );
}
