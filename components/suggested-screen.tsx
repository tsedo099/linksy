"use client";

import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { displayMediaSrc } from "@/lib/media";
import { userProfileHref } from "@/lib/user-url";

type SuggestionState = "follow" | "requested" | "following";

type Suggestion = {
  id: string;
  username: string;
  displayName: string;
  context: string;
  avatarUrl: string | null;
  isVerified?: boolean;
  state?: SuggestionState;
};

function Avatar({ item }: { item: Suggestion }) {
  const initials = (item.displayName || item.username).slice(0, 2).toUpperCase();
  return (
    <div className="sg-avatar" style={{ background: "linear-gradient(135deg,var(--app-accent),var(--app-accent-secondary))" }}>
      {item.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={displayMediaSrc(item.avatarUrl) ?? item.avatarUrl} alt="" className="sg-avatar-img" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

export function SuggestedScreen() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [states, setStates] = useState<Record<string, SuggestionState>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch("/api/users/suggested?limit=30")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!alive) return;
        const items = (data?.users ?? []) as Suggestion[];
        setSuggestions(items);
        setStates(Object.fromEntries(items.map((item) => [item.id, item.state ?? (item as any).followedByMe ? "following" : "follow"])));
      })
      .catch(() => {
        if (alive) setError("Could not load suggestions.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const ordered = useMemo(() => suggestions, [suggestions]);

  async function toggleFollow(id: string) {
    if (pendingId) return;
    const previous = states[id] ?? "follow";
    const optimistic = previous === "follow" ? "following" : "follow";
    setPendingId(id);
    setStates((current) => ({ ...current, [id]: optimistic }));

    try {
      const res = await fetch(`/api/users/${id}/follow`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Follow failed");
      setStates((current) => ({ ...current, [id]: data.following ? "following" : "follow" }));
    } catch {
      setStates((current) => ({ ...current, [id]: previous }));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <AppShell>
      <section className="sg-shell">
        <div className="sg-wrap">
          <div className="sg-list-head">
            <h1>Suggested</h1>
          </div>

          <div className="sg-list" role="list" aria-label="Suggested friends">
            {loading && (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="sg-row sg-row--skel">
                  <div className="sg-user">
                    <div className="sg-avatar sg-skel" />
                    <div className="sg-copy">
                      <div className="sg-skel sg-skel--line" />
                      <div className="sg-skel sg-skel--line sg-skel--sm" />
                    </div>
                  </div>
                  <div className="sg-action sg-skel" />
                </div>
              ))
            )}
            {!loading && error && (
              <div style={{ padding: "1rem 0", opacity: 0.75, color: "#fff" }}>{error}</div>
            )}
            {!loading && !error && ordered.map((item) => {
              const state = states[item.id];
              return (
                <article key={item.id} className="sg-row" role="listitem">
                  <Link href={userProfileHref(item)} className="sg-user">
                    <Avatar item={item} />
                    <div className="sg-copy">
                      <p className="sg-username">{item.username}</p>
                      {item.displayName.trim() ? (
                        <p className="sg-name">{item.displayName}</p>
                      ) : null}
                      <p className="sg-context">{item.context}</p>
                    </div>
                  </Link>

                  <button
                    type="button"
                    className={`sg-action sg-action--${state}`}
                    onClick={() => toggleFollow(item.id)}
                    disabled={pendingId === item.id}
                  >
                    {state === "requested" ? "Requested" : state === "following" ? "Following" : "Follow"}
                  </button>
                </article>
              );
            })}
          </div>
        </div>

        <style>{`
          .sg-shell {
            height: 100%;
            overflow-y: auto;
            background: #0b0e12;
          }

          .sg-wrap {
            width: min(100%, 54rem);
            margin: 0 auto;
            padding: 3rem 1.5rem 4rem;
          }

          .sg-list-head {
            margin-bottom: 1.4rem;
          }

          .sg-list-head h1 {
            margin: 0;
            font-size: 1.9rem;
            font-weight: 800;
            color: #fff;
            letter-spacing: -0.03em;
          }

          .sg-list {
            display: flex;
            flex-direction: column;
          }

          .sg-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 1rem;
            align-items: center;
            padding: 0.9rem 0;
          }

          .sg-user {
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 0.95rem;
            text-decoration: none;
          }

          .sg-avatar {
            width: 3.6rem;
            height: 3.6rem;
            border-radius: 999px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
            font-size: 0.95rem;
            font-weight: 800;
            flex-shrink: 0;
            overflow: hidden;
          }
          .sg-avatar-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }

          .sg-row--skel { opacity: 0.7; }
          .sg-skel {
            background: rgba(255,255,255,0.08);
            border-radius: 10px;
            animation: sg-pulse 1.35s ease-in-out infinite;
          }
          .sg-skel--line { height: 14px; width: 14rem; margin-top: 0.15rem; }
          .sg-skel--sm { width: 10rem; height: 12px; opacity: 0.75; }
          @keyframes sg-pulse { 0%,100% { opacity: 0.35; } 50% { opacity: 0.85; } }

          .sg-copy {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 0.1rem;
          }

          .sg-username,
          .sg-name,
          .sg-context {
            margin: 0;
            min-width: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .sg-username {
            color: #fff;
            font-size: 1rem;
            font-weight: 700;
            line-height: 1.2;
          }

          .sg-name {
            color: #c9d1d9;
            font-size: 0.98rem;
            line-height: 1.2;
          }

          .sg-context {
            color: rgba(255,255,255,0.62);
            font-size: 0.92rem;
            line-height: 1.25;
          }

          .sg-action {
            min-width: 6.5rem;
            min-height: 2.5rem;
            border: 0;
            border-radius: 0.75rem;
            padding: 0 1rem;
            font-size: 0.92rem;
            font-weight: 800;
            cursor: pointer;
            transition: transform 140ms ease, opacity 140ms ease, background 140ms ease, color 140ms ease;
          }

          .sg-action:hover {
            transform: translateY(-1px);
          }

          .sg-action--follow {
            background: #4f5dff;
            color: #fff;
          }

          .sg-action--requested,
          .sg-action--following {
            background: #2c3138;
            color: #fff;
          }

          html[data-theme="light"] .sg-shell {
            background: #f5f7fb;
          }

          html[data-theme="light"] .sg-list-head h1,
          html[data-theme="light"] .sg-username {
            color: #0f172a;
          }

          html[data-theme="light"] .sg-name {
            color: #334155;
          }

          html[data-theme="light"] .sg-context {
            color: #64748b;
          }

          html[data-theme="light"] .sg-action--requested,
          html[data-theme="light"] .sg-action--following {
            background: #e2e8f0;
            color: #0f172a;
          }

          @media (max-width: 720px) {
            .sg-wrap {
              padding: 1.25rem 1rem 2rem;
            }

            .sg-row {
              grid-template-columns: 1fr;
              gap: 0.75rem;
            }

            .sg-action {
              width: 100%;
            }
          }

          @media (max-width: 480px) {
            .sg-wrap { padding: 0.9rem 0.75rem 1.5rem; }
            .sg-row { padding: 0.7rem 0.85rem; }
            .sg-title { font-size: 1.4rem; }
          }

          @media (pointer: coarse) {
            .sg-action { min-height: 44px; }
          }

          @media (prefers-reduced-motion: reduce) {
            .sg-action { transition: none !important; }
          }
        `}</style>
      </section>
    </AppShell>
  );
}
