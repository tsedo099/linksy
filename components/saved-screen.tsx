"use client";

import { AppShell } from "@/components/app-shell";
import { SkeletonGridItem } from "@/components/skeleton";
import { useLanguagePreferences } from "@/components/language-provider";
import { displayMediaSrc } from "@/lib/media";
import { useEffect, useMemo, useState } from "react";

const STRINGS = {
  en: {
    kicker: "Library",
    title: "Saved posts",
    sub: (n: number) => `${n} saved posts ready to revisit.`,
    organize: "Organize",
    done: "Done",
    remove: (n: number) => `Remove ${n}`,
    filtersAria: "Saved filters",
    filterAll: "All",
    filterRecent: "Recent",
    filterCaptions: "With captions",
    hintOrganizing: "Select posts, then remove them from saved.",
    hintHover: "Hover a post to unsave it quickly.",
    loadError: "Saved posts failed to load.",
    removeError: "Could not remove that saved post. Please try again.",
    emptyTitle: "No saved posts here",
    emptySub: "Save posts from the feed, then organize or remove them here.",
    selectAria: "Select saved post",
    deselectAria: "Deselect saved post",
    removing: "Removing...",
    unsave: "Unsave",
  },
  mn: {
    kicker: "Сан",
    title: "Хадгалсан постууд",
    sub: (n: number) => `${n} пост хадгалсан байна.`,
    organize: "Засах",
    done: "Болсон",
    remove: (n: number) => `${n}-ийг хасах`,
    filtersAria: "Хадгалсаны шүүлтүүр",
    filterAll: "Бүгд",
    filterRecent: "Сүүлийн",
    filterCaptions: "Тайлбартай",
    hintOrganizing: "Пост сонгоод хадгалсангаас хасна.",
    hintHover: "Постын дээгүүр зөөвөл хурдан хасах боломжтой.",
    loadError: "Хадгалсан постууд ачаалж чадсангүй.",
    removeError: "Хасах боломжгүй боллоо. Дахин оролдоно уу.",
    emptyTitle: "Хадгалсан пост алга",
    emptySub: "Feed дээрээс постыг хадгалаад энд эмхэлж эсвэл хасч болно.",
    selectAria: "Хадгалсан постыг сонгох",
    deselectAria: "Сонголтыг арилгах",
    removing: "Хасаж байна...",
    unsave: "Хасах",
  },
};

type SavedPost = {
  id: string;
  imageUrl: string | null;
  caption: string | null;
  createdAt: string;
  savedAt: string;
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null };
  _count: { likes: number; comments: number };
};

const COLLECTIONS = ["All", "Recent", "With captions"] as const;
type CollectionFilter = (typeof COLLECTIONS)[number];

const IcBookmark = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="40" height="40">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);

const IcHeart = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="white" width="14" height="14">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const IcComment = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="white" width="14" height="14">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IcCheck = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

function Av({ user }: { user: SavedPost["user"] }) {
  const colors = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#3b82f6"];
  const color = colors[(user.username.charCodeAt(0) || 0) % colors.length];

  if (user.avatarUrl) {
    return <img src={displayMediaSrc(user.avatarUrl) ?? user.avatarUrl} alt="" className="sv-avatar-img" />;
  }

  return (
    <div className="sv-avatar-fallback" style={{ background: color }}>
      {((user.displayName || user.username)[0] ?? "?").toUpperCase()}
    </div>
  );
}

export function SavedScreen() {
  const { language } = useLanguagePreferences();
  const t = useMemo(() => (language === "mn" ? STRINGS.mn : STRINGS.en), [language]);
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<CollectionFilter>("All");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/posts/saved")
      .then((res) => (res.ok ? res.json() : { posts: [] }))
      .then((data) => setPosts(data.posts ?? []))
      .catch(() => setError(t.loadError))
      .finally(() => setLoading(false));
  }, [t]);

  const filteredPosts = useMemo(() => {
    if (filter === "Recent") {
      return posts.slice(0, 6);
    }

    if (filter === "With captions") {
      return posts.filter((post) => Boolean(post.caption?.trim()));
    }

    return posts;
  }, [filter, posts]);

  const selectedCount = selectedIds.size;

  function toggleSelected(postId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }

  function toggleOrganizing() {
    setOrganizing((current) => {
      if (current) {
        setSelectedIds(new Set());
      }
      return !current;
    });
  }

  async function unsave(postId: string) {
    const previousPosts = posts;
    setError(null);
    setPendingIds((current) => new Set(current).add(postId));
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(postId);
      return next;
    });
    setPosts((current) => current.filter((post) => post.id !== postId));

    try {
      const res = await fetch(`/api/posts/${postId}/save`, { method: "POST" });
      if (!res.ok) throw new Error("Unsave failed");
      const data: { saved: boolean } = await res.json();
      if (data.saved) {
        throw new Error("Post was saved again instead of removed");
      }
    } catch {
      setPosts(previousPosts);
      setError(t.removeError);
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  }

  async function removeSelected() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    await Promise.all(ids.map((id) => unsave(id)));
    setOrganizing(false);
    setSelectedIds(new Set());
  }

  return (
    <AppShell>
      <main className="sv-shell">
        <header className="sv-header">
          <div>
            <p className="sv-kicker">{t.kicker}</p>
            <h1 className="sv-title">{t.title}</h1>
            <p className="sv-sub">{t.sub(posts.length)}</p>
          </div>

          <div className="sv-header-actions">
            {organizing && selectedCount > 0 ? (
              <button type="button" className="sv-danger-btn" onClick={removeSelected}>
                {t.remove(selectedCount)}
              </button>
            ) : null}
            <button type="button" className="sv-organize-btn" onClick={toggleOrganizing}>
              {organizing ? t.done : t.organize}
            </button>
          </div>
        </header>

        <section className="sv-toolbar" aria-label={t.filtersAria}>
          <div className="sv-filter-row">
            {COLLECTIONS.map((item) => {
              const label = item === "All" ? t.filterAll : item === "Recent" ? t.filterRecent : t.filterCaptions;
              return (
                <button
                  key={item}
                  type="button"
                  className={`sv-filter${filter === item ? " sv-filter--active" : ""}`}
                  onClick={() => setFilter(item)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {organizing ? (
            <span className="sv-organize-hint">{t.hintOrganizing}</span>
          ) : (
            <span className="sv-organize-hint">{t.hintHover}</span>
          )}
        </section>

        {error ? <p className="sv-error">{error}</p> : null}

        {loading ? (
          <div className="sv-grid">
            {[0, 1, 2, 3, 4, 5].map((item) => <SkeletonGridItem key={item} />)}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="sv-empty">
            <IcBookmark />
            <p className="sv-empty-title">{t.emptyTitle}</p>
            <p className="sv-empty-sub">{t.emptySub}</p>
          </div>
        ) : (
          <div className={`sv-grid${organizing ? " sv-grid--organizing" : ""}`}>
            {filteredPosts.map((post) => {
              const selected = selectedIds.has(post.id);
              const pending = pendingIds.has(post.id);

              return (
                <article
                  key={post.id}
                  className={`sv-item${selected ? " sv-item--selected" : ""}${pending ? " sv-item--pending" : ""}`}
                  onMouseEnter={() => setHovered(post.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div
                    className="sv-thumb"
                    style={{
                      background: post.imageUrl ? undefined : "linear-gradient(135deg, #1e1b4b, #3730a3 50%, #6d28d9)",
                    }}
                  >
                    {post.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.imageUrl ? (displayMediaSrc(post.imageUrl) ?? post.imageUrl) : ""} alt="" className="sv-thumb-img" />
                    )}

                    {organizing ? (
                      <button
                        type="button"
                        className={`sv-select-btn${selected ? " sv-select-btn--checked" : ""}`}
                        onClick={() => toggleSelected(post.id)}
                        aria-pressed={selected}
                        aria-label={selected ? t.deselectAria : t.selectAria}
                      >
                        {selected ? <IcCheck /> : null}
                      </button>
                    ) : null}

                    {!organizing && hovered === post.id ? (
                      <div className="sv-overlay">
                        <div className="sv-overlay-stats">
                          <span><IcHeart /> {post._count.likes}</span>
                          <span><IcComment /> {post._count.comments}</span>
                        </div>
                        <button type="button" className="sv-unsave-btn" onClick={() => unsave(post.id)} disabled={pending}>
                          {pending ? t.removing : t.unsave}
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="sv-item-meta">
                    <Av user={post.user} />
                    <div className="sv-item-info">
                      <p className="sv-item-user">{post.user.displayName || post.user.username}</p>
                      {post.caption ? <p className="sv-item-caption">{post.caption}</p> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <style>{`
        .sv-shell {
          min-height: 100vh;
          overflow-y: auto;
          background: var(--app-background);
          padding: 1.35rem 2rem 5rem;
        }

        .sv-shell::-webkit-scrollbar { width: 4px; }
        .sv-shell::-webkit-scrollbar-thumb { background: var(--app-border); border-radius: 2px; }

        .sv-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          max-width: 1080px;
          margin: 0 auto 0.85rem;
          padding: 1rem 1.1rem;
          border: 1px solid var(--app-border);
          border-radius: 1rem;
          background: var(--app-card);
        }

        .sv-kicker {
          margin: 0 0 0.25rem;
          color: var(--app-accent);
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .sv-title {
          margin: 0;
          color: var(--text);
          font-size: clamp(1.35rem, 2.4vw, 2rem);
          font-weight: 900;
          letter-spacing: -0.045em;
          line-height: 1.05;
        }

        .sv-sub {
          margin: 0.38rem 0 0;
          color: var(--muted);
          font-size: 0.82rem;
        }

        .sv-header-actions,
        .sv-filter-row {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          flex-wrap: wrap;
        }

        .sv-organize-btn,
        .sv-danger-btn,
        .sv-filter {
          border: 1px solid var(--app-border);
          border-radius: 999px;
          font-weight: 850;
          cursor: pointer;
        }

        .sv-organize-btn,
        .sv-danger-btn {
          min-height: 2.55rem;
          padding: 0 0.95rem;
          background: var(--app-card-soft);
          color: var(--app-text);
        }

        .sv-danger-btn {
          background: rgb(239 68 68 / 0.12);
          border-color: rgb(239 68 68 / 0.28);
          color: #ef4444;
        }

        .sv-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          max-width: 1080px;
          margin: 0 auto 1rem;
          padding: 0.55rem;
          border: 1px solid var(--app-border);
          border-radius: 1rem;
          background: var(--app-card);
        }

        .sv-filter {
          padding: 0.5rem 0.85rem;
          background: transparent;
          color: var(--app-text-muted);
          font-size: 0.78rem;
        }

        .sv-filter--active {
          background: var(--app-accent);
          border-color: var(--app-accent);
          color: #fff;
        }

        .sv-organize-hint {
          color: var(--app-text-muted);
          font-size: 0.76rem;
          font-weight: 700;
        }

        .sv-error {
          margin: 0 0 1rem;
          color: #ef4444;
          font-size: 0.82rem;
          font-weight: 800;
        }

        .sv-empty {
          min-height: 50vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          color: var(--muted);
          text-align: center;
        }

        .sv-empty-title {
          margin: 0;
          color: var(--text);
          font-size: 1.05rem;
          font-weight: 800;
        }

        .sv-empty-sub {
          max-width: 23rem;
          margin: 0;
          color: var(--muted);
          font-size: 0.84rem;
          line-height: 1.5;
        }

        .sv-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
          gap: 0.85rem;
          max-width: 1080px;
          margin: 0 auto;
        }

        .sv-item {
          overflow: hidden;
          border: 1px solid var(--app-border);
          border-radius: 0.9rem;
          background: var(--app-card);
          transition: border-color 0.15s, opacity 0.15s, background 0.15s;
        }

        .sv-item:hover {
          border-color: color-mix(in srgb, var(--app-border) 70%, var(--app-text) 30%);
        }

        .sv-item--selected {
          border-color: rgb(var(--app-accent-rgb) / 0.5);
          background: rgb(var(--app-accent-rgb) / 0.06);
        }

        .sv-item--pending {
          opacity: 0.6;
          pointer-events: none;
        }

        .sv-thumb {
          position: relative;
          aspect-ratio: 1;
          overflow: hidden;
          background: #1e1b4b;
        }

        .sv-thumb-img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .sv-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.65rem;
          background: rgb(0 0 0 / 0.48);
          animation: sv-fade 0.15s ease;
        }

        @keyframes sv-fade { from { opacity: 0 } to { opacity: 1 } }

        .sv-overlay-stats {
          display: flex;
          gap: 1rem;
          color: #fff;
          font-size: 0.82rem;
          font-weight: 800;
        }

        .sv-overlay-stats span {
          display: flex;
          align-items: center;
          gap: 0.3rem;
        }

        .sv-unsave-btn {
          padding: 0.45rem 1rem;
          border: 1.5px solid rgb(255 255 255 / 0.72);
          border-radius: 999px;
          background: transparent;
          color: #fff;
          font-size: 0.78rem;
          font-weight: 800;
          cursor: pointer;
        }

        .sv-unsave-btn:hover {
          background: rgb(255 255 255 / 0.14);
        }

        .sv-select-btn {
          position: absolute;
          top: 0.6rem;
          right: 0.6rem;
          width: 1.9rem;
          height: 1.9rem;
          border: 1.5px solid rgb(255 255 255 / 0.75);
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: rgb(0 0 0 / 0.35);
          color: #fff;
          cursor: pointer;
        }

        .sv-select-btn--checked {
          background: var(--app-accent);
          border-color: var(--app-accent);
        }

        .sv-item-meta {
          display: flex;
          align-items: center;
          gap: 0.58rem;
          padding: 0.62rem 0.68rem;
        }

        .sv-avatar-img,
        .sv-avatar-fallback {
          width: 1.9rem;
          height: 1.9rem;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .sv-avatar-img {
          object-fit: cover;
        }

        .sv-avatar-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 0.72rem;
          font-weight: 900;
        }

        .sv-item-info {
          flex: 1;
          min-width: 0;
        }

        .sv-item-user {
          margin: 0 0 0.12rem;
          color: var(--text);
          font-size: 0.8rem;
          font-weight: 800;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sv-item-caption {
          margin: 0;
          color: var(--muted);
          font-size: 0.73rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @media (max-width: 720px) {
          .sv-shell {
            padding: 1rem 0.85rem 5rem;
          }

          .sv-header,
          .sv-toolbar {
            align-items: stretch;
            flex-direction: column;
          }

          .sv-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.7rem;
          }

          .sv-header-actions {
            justify-content: flex-start;
          }
        }

        @media (max-width: 480px) {
          .sv-shell { padding: 0.85rem 0.7rem 4.5rem; }
          .sv-title { font-size: 1.4rem; }
          .sv-sub { font-size: 0.82rem; }
          .sv-grid { gap: 0.5rem; }
        }

        @media (pointer: coarse) {
          .sv-header-actions button { min-height: 40px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .sv-tile, .sv-header-actions button { transition: none !important; }
        }
      `}</style>
    </AppShell>
  );
}
