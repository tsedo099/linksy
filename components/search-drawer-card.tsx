"use client";

import { displayMediaSrc } from "@/lib/media";
import { listenStoryViewed } from "@/lib/story-view-sync";
import { userProfileHref } from "@/lib/user-url";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type ApiUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  hasActiveStory?: boolean;
  hasUnviewedStory?: boolean;
};

const RECENT_KEY = "linksy-recent-searches";

function loadRecent(): ApiUser[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is ApiUser =>
        Boolean(x && typeof x === "object" && typeof (x as ApiUser).id === "string"),
    );
  } catch {
    return [];
  }
}

function saveRecent(users: ApiUser[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(users.slice(0, 10)));
  } catch {
    /* ignore */
  }
}

function mergeRecent(user: ApiUser) {
  const rest = loadRecent().filter(u => u.id !== user.id);
  saveRecent([user, ...rest]);
}

export function SearchDrawerCard({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiUser[]>([]);
  const [recent, setRecent] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  const refreshResults = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : { users: [] }))
      .then((d: { users?: ApiUser[] }) => setResults(Array.isArray(d.users) ? d.users : []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    timerRef.current = setTimeout(() => refreshResults(trimmed), 280);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, refreshResults]);

  useEffect(() => {
    return listenStoryViewed(({ authorId }) => {
      setResults(users =>
        users.map(u =>
          u.id === authorId ? { ...u, hasUnviewedStory: false } : u,
        ),
      );
      setRecent(users =>
        users.map(u =>
          u.id === authorId ? { ...u, hasUnviewedStory: false } : u,
        ),
      );
    });
  }, []);

  function goProfile(user: ApiUser) {
    mergeRecent(user);
    setRecent(loadRecent());
    onNavigate?.();
    router.push(userProfileHref(user));
  }

  function clearRecent() {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      /* ignore */
    }
    setRecent([]);
  }

  const showRecent = !query.trim() && recent.length > 0;
  const list = query.trim() ? results : recent;

  return (
    <div className="sd-search-card" style={{ padding: "1rem 1.1rem 1.25rem" }}>
      <div className="sd-header" style={{ marginBottom: "0.75rem" }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text)" }}>Search</h2>
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
          Quick user search. Open full search for posts, hashtags, and filters.
        </p>
      </div>

      <input
        id="sd-search-input"
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search people…"
        autoComplete="off"
        aria-label="Search users"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "0.55rem 0.7rem",
          borderRadius: 10,
          border: "1px solid var(--app-border, var(--feed-border))",
          background: "var(--app-card, var(--surface-soft))",
          color: "var(--text)",
          fontSize: "0.88rem",
          outline: "none",
        }}
      />

      <div style={{ marginTop: "0.65rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {showRecent ? "Recent" : query.trim() ? "People" : ""}
        </span>
        {showRecent ? (
          <button
            type="button"
            onClick={clearRecent}
            style={{
              fontSize: "0.72rem",
              fontWeight: 600,
              border: "none",
              background: "none",
              color: "var(--app-accent, var(--feed-accent))",
              cursor: "pointer",
              padding: "0.15rem 0",
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      <ul style={{ listStyle: "none", margin: "0.55rem 0 0", padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {loading && query.trim() ? (
          <li style={{ color: "var(--muted)", fontSize: "0.82rem", padding: "0.5rem 0" }}>Searching…</li>
        ) : null}
        {!loading && query.trim() && list.length === 0 ? (
          <li style={{ color: "var(--muted)", fontSize: "0.82rem", padding: "0.5rem 0" }}>No users found.</li>
        ) : null}
        {!query.trim() && recent.length === 0 && !loading ? (
          <li style={{ color: "var(--muted)", fontSize: "0.82rem", padding: "0.5rem 0" }}>
            Type a name or username. Profiles you open are saved here on this device.
          </li>
        ) : null}
        {list.map(user => {
          const name = user.displayName || user.username;
          const initials = name.slice(0, 2).toUpperCase();
          const ringStyle =
            user.hasActiveStory
              ? {
                  padding: 2,
                  borderRadius: 999,
                  background: user.hasUnviewedStory
                    ? "linear-gradient(135deg, var(--feed-accent, #6366f1), var(--feed-accent-secondary, #a855f7))"
                    : "rgba(255,255,255,0.22)",
                  boxSizing: "content-box" as const,
                  flexShrink: 0,
                  lineHeight: 0,
                }
              : { flexShrink: 0, lineHeight: 0 };
          return (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => goProfile(user)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.65rem",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.45rem 0.35rem",
                  border: "none",
                  borderRadius: 10,
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--text)",
                }}
              >
                <span style={ringStyle}>
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={displayMediaSrc(user.avatarUrl) ?? user.avatarUrl}
                      alt=""
                      width={44}
                      height={44}
                      style={{ borderRadius: "999px", objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "999px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "linear-gradient(135deg, var(--app-accent), var(--app-accent-secondary, #a855f7))",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                      }}
                    >
                      {initials}
                    </span>
                  )}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: "0.88rem" }}>{name}</span>
                  <span style={{ display: "block", fontSize: "0.78rem", color: "var(--muted)" }}>@{user.username}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div style={{ marginTop: "1rem", paddingTop: "0.85rem", borderTop: "1px solid var(--app-border, var(--feed-border))" }}>
        <Link
          href="/search?focus=1"
          onClick={() => onNavigate?.()}
          style={{
            display: "block",
            textAlign: "center",
            fontSize: "0.82rem",
            fontWeight: 700,
            color: "var(--app-accent, var(--feed-accent))",
            textDecoration: "none",
          }}
        >
          Full search (posts & filters)
        </Link>
      </div>
    </div>
  );
}
