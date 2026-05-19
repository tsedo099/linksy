"use client";

import { AppShell } from "@/components/app-shell";
import { SkeletonGridItem } from "@/components/skeleton";
import { useLanguagePreferences } from "@/components/language-provider";
import { displayMediaSrc } from "@/lib/media";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STRINGS = {
  en: {
    kicker: "Studio",
    title: "Draft posts",
    sub: (n: number) => `${n} draft${n === 1 ? "" : "s"} — same layout as Saved, tuned for unfinished posts.`,
    organize: "Organize",
    done: "Done",
    deleteN: (n: number) => `Delete ${n}`,
    filtersAria: "Draft filters",
    filterAll: "All",
    filterRecent: "Recent",
    filterCaptions: "With captions",
    hintOrganizing: "Select drafts, then delete them in one tap.",
    hintHover: "Hover a card to continue editing or delete.",
    loadError: "Drafts failed to load.",
    deleteError: "Could not delete that draft. Please try again.",
    emptyTitle: "No drafts yet",
    emptySub: "Start a post on Create, save a draft, and it will show up here with thumbnails and captions.",
    selectAria: "Select draft",
    deselectAria: "Deselect draft",
    continue: "Continue",
    delete: "Delete",
    draftLabel: "Draft",
    noCaption: "No caption yet",
    mediaCount: (n: number) => `${n} media`,
  },
  mn: {
    kicker: "Студи",
    title: "Ноорог пост",
    sub: (n: number) => `${n} ноорог — Saved-той ижил layout, гүйцэт болоогүй постод тохирсон.`,
    organize: "Засах",
    done: "Болсон",
    deleteN: (n: number) => `${n}-ийг устгах`,
    filtersAria: "Ноорог шүүлтүүр",
    filterAll: "Бүгд",
    filterRecent: "Сүүлийн",
    filterCaptions: "Тайлбартай",
    hintOrganizing: "Ноорог сонгоод нэг товшилтоор устгана.",
    hintHover: "Карт дээр зөөвөл засах эсвэл устгах боломжтой.",
    loadError: "Ноорог ачаалж чадсангүй.",
    deleteError: "Устгаж чадсангүй. Дахин оролдоно уу.",
    emptyTitle: "Ноорог байхгүй",
    emptySub: "Create-ээс пост эхлүүлж, ноорог хадгалаарай — энд thumb болон caption-той гарна.",
    selectAria: "Ноорог сонгох",
    deselectAria: "Сонголтыг арилгах",
    continue: "Үргэлжлүүлэх",
    delete: "Устгах",
    draftLabel: "Ноорог",
    noCaption: "Тайлбар алга",
    mediaCount: (n: number) => `${n} файл`,
  },
};

type DraftRow = {
  id: string;
  caption: string | null;
  mediaUrls: string[];
  audience: string;
  createdAt: string;
  updatedAt: string;
  thumbUrl: string | null;
};

type MeUser = { id: string; username: string; displayName: string | null; avatarUrl: string | null };

const FILTERS = ["All", "Recent", "With captions"] as const;
type FilterKey = (typeof FILTERS)[number];

const IcDraft = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="40" height="40">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2Z" />
    <path d="M14 2v6h6" />
    <path d="M8 13h8M8 17h6" />
  </svg>
);

const IcCheck = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

function Av({ user }: { user: MeUser }) {
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

function formatShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function DraftsScreen() {
  const router = useRouter();
  const { language } = useLanguagePreferences();
  const t = useMemo(() => (language === "mn" ? STRINGS.mn : STRINGS.en), [language]);
  const [me, setMe] = useState<MeUser | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterKey>("All");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.user) setMe(d.user);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch("/api/posts/draft")
      .then((res) => (res.ok ? res.json() : { drafts: [] }))
      .then((data) => setDrafts(data.drafts ?? []))
      .catch(() => setError(t.loadError))
      .finally(() => setLoading(false));
  }, []);

  const filteredDrafts = useMemo(() => {
    if (filter === "Recent") {
      return drafts.slice(0, 6);
    }
    if (filter === "With captions") {
      return drafts.filter((row) => Boolean(row.caption?.trim()));
    }
    return drafts;
  }, [filter, drafts]);

  const selectedCount = selectedIds.size;

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleOrganizing() {
    setOrganizing((current) => {
      if (current) setSelectedIds(new Set());
      return !current;
    });
  }

  async function deleteDraft(id: string) {
    const previous = drafts;
    setError(null);
    setPendingIds((current) => new Set(current).add(id));
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setDrafts((current) => current.filter((row) => row.id !== id));

    try {
      const res = await fetch(`/api/posts/draft/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    } catch {
      setDrafts(previous);
      setError(t.deleteError);
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    await Promise.all(ids.map((id) => deleteDraft(id)));
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
            <p className="sv-sub">{t.sub(drafts.length)}</p>
          </div>

          <div className="sv-header-actions">
            {organizing && selectedCount > 0 ? (
              <button type="button" className="sv-danger-btn" onClick={deleteSelected}>
                {t.deleteN(selectedCount)}
              </button>
            ) : null}
            <button type="button" className="sv-organize-btn" onClick={toggleOrganizing}>
              {organizing ? t.done : t.organize}
            </button>
          </div>
        </header>

        <section className="sv-toolbar" aria-label={t.filtersAria}>
          <div className="sv-filter-row">
            {FILTERS.map((item) => {
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
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <SkeletonGridItem key={item} />
            ))}
          </div>
        ) : filteredDrafts.length === 0 ? (
          <div className="sv-empty">
            <IcDraft />
            <p className="sv-empty-title">{t.emptyTitle}</p>
            <p className="sv-empty-sub">{t.emptySub}</p>
          </div>
        ) : (
          <div className={`sv-grid${organizing ? " sv-grid--organizing" : ""}`}>
            {filteredDrafts.map((draft) => {
              const selected = selectedIds.has(draft.id);
              const pending = pendingIds.has(draft.id);
              const thumbSrc = draft.thumbUrl ? (displayMediaSrc(draft.thumbUrl) ?? draft.thumbUrl) : null;

              return (
                <article
                  key={draft.id}
                  className={`sv-item${selected ? " sv-item--selected" : ""}${pending ? " sv-item--pending" : ""}`}
                  onMouseEnter={() => setHovered(draft.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <div
                    className="sv-thumb"
                    style={{
                      background: thumbSrc ? undefined : "linear-gradient(135deg, #1e1b4b, #3730a3 50%, #6d28d9)",
                    }}
                  >
                    {thumbSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbSrc} alt="" className="sv-thumb-img" />
                    ) : null}

                    {organizing ? (
                      <button
                        type="button"
                        className={`sv-select-btn${selected ? " sv-select-btn--checked" : ""}`}
                        onClick={() => toggleSelected(draft.id)}
                        aria-pressed={selected}
                        aria-label={selected ? t.deselectAria : t.selectAria}
                      >
                        {selected ? <IcCheck /> : null}
                      </button>
                    ) : null}

                    {!organizing && hovered === draft.id ? (
                      <div className="sv-overlay">
                        <div className="sv-overlay-stats">
                          <span>{t.mediaCount(draft.mediaUrls.length)}</span>
                          <span>{formatShort(draft.updatedAt)}</span>
                        </div>
                        <div className="sv-draft-overlay-actions">
                          <button
                            type="button"
                            className="sv-unsave-btn"
                            onClick={() => router.push(`/create?draft=${encodeURIComponent(draft.id)}`)}
                          >
                            {t.continue}
                          </button>
                          <button type="button" className="sv-draft-del-btn" onClick={() => deleteDraft(draft.id)} disabled={pending}>
                            {pending ? "…" : t.delete}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="sv-item-meta">
                    {me ? <Av user={me} /> : <div className="sv-avatar-fallback" style={{ background: "#6366f1" }}>…</div>}
                    <div className="sv-item-info">
                      <p className="sv-item-user">{t.draftLabel} · {draft.audience.replace("_", " ")}</p>
                      {draft.caption ? (
                        <p className="sv-item-caption">{draft.caption}</p>
                      ) : (
                        <p className="sv-item-caption sv-item-caption--muted">{t.noCaption}</p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <style>{`
        .sv-draft-overlay-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
          justify-content: center;
        }
        .sv-draft-del-btn {
          padding: 0.45rem 1rem;
          border: 1.5px solid rgb(239 68 68 / 0.85);
          border-radius: 999px;
          background: rgb(0 0 0 / 0.25);
          color: #fecaca;
          font-size: 0.78rem;
          font-weight: 800;
          cursor: pointer;
        }
        .sv-draft-del-btn:hover:not(:disabled) {
          background: rgb(239 68 68 / 0.35);
          color: #fff;
        }
        .sv-draft-del-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }
        .sv-item-caption--muted {
          font-style: italic;
          opacity: 0.85;
        }

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
          .sv-tile-action { min-width: 40px; min-height: 40px; }
        }

        @media (prefers-reduced-motion: reduce) {
          .sv-tile, .sv-header-actions button { transition: none !important; }
        }
      `}</style>
    </AppShell>
  );
}
