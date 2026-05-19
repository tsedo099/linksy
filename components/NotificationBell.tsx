"use client";

import { useEffect, useRef, useState } from "react";

type NotifItem = {
  id:        string;
  type:      string;
  read:      boolean;
  createdAt: string;
  from:      { id: string; username: string; displayName: string; avatarUrl: string | null };
  post:      { id: string; mediaUrls: string[] } | null;
};

const TYPE_ICON: Record<string, string> = {
  like:             "❤️",
  comment:          "💬",
  follow:           "👤",
  LIKE_RECEIVED:    "❤️",
  COMMENT_RECEIVED: "💬",
  FOLLOW_RECEIVED:  "👤",
  mention:          "📣",
  xp:               "⚡",
  story_reaction:   "✨",
  story_collab:     "🤝",
};

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function NotificationBell() {
  const [open, setOpen]         = useState(false);
  const [unread, setUnread]     = useState(0);
  const [items, setItems]       = useState<NotifItem[]>([]);
  const [loading, setLoading]   = useState(false);
  const ref                     = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setUnread(d.unreadCount ?? 0); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/notifications")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setItems(d.notifications ?? []);
        setUnread(0);
        // mark all read
        fetch("/api/notifications/read", { method: "POST" }).catch(() => {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button
        className="notif-bell-btn icon-ghost-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
          strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
          <path d="M18 8A6 6 0 1 0 6 8c0 5.5-2.5 8-2.5 8h15S16 13.5 16 8"/>
          <path d="M9.5 20a2.5 2.5 0 0 0 5 0"/>
        </svg>
        {unread > 0 && (
          <span className="notif-bell-badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span>Notifications</span>
          </div>
          <div className="notif-panel-list">
            {loading ? (
              <div className="notif-panel-empty">Loading...</div>
            ) : items.length === 0 ? (
              <div className="notif-panel-empty">No notifications yet</div>
            ) : (
              items.map((n) => (
                <div key={n.id} className={`notif-item${n.read ? "" : " notif-item--unread"}`}>
                  <span className="notif-item-icon">{TYPE_ICON[n.type] ?? "🔔"}</span>
                  <div className="notif-item-body">
                    <p className="notif-item-text">
                      <strong>{n.from.displayName}</strong>{" "}
                      {n.type === "like"           ? "liked your post"     :
                       n.type === "comment"        ? "commented on your post" :
                       n.type === "follow"         ? "started following you" :
                       n.type === "mention"        ? "mentioned you"       :
                       n.type === "story_reaction" ? "reacted to your story" :
                       n.type === "story_collab"   ? "added you as a collaborator" :
                       n.type}
                    </p>
                    <p className="notif-item-time">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
