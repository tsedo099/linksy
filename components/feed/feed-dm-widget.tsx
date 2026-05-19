"use client";

import { AVATAR_PLACEHOLDER_GRADIENT } from "@/lib/avatar-placeholder";
import { useDmWidgetStore } from "@/lib/stores/dm-widget";
import { displayMediaSrc } from "@/lib/media";
import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import ui from "@/components/ui/ui.module.css";

type ConversationUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

type ConversationLastMessage = {
  text: string | null;
  mediaUrl: string | null;
  createdAt: string;
  senderId: string;
  read: boolean;
  readAt: string | null;
  deletedAt: string | null;
} | null;

type ApiConversation = {
  id: string;
  isGroup: boolean;
  name: string | null;
  updatedAt: string;
  otherUser: ConversationUser | null;
  members: ConversationUser[];
  lastMessage: ConversationLastMessage;
  unread: number;
};

function initialsFor(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return "??";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
  return trimmed.slice(0, 2).toUpperCase();
}

function formatRelativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

function previewFor(c: ApiConversation, viewerId: string | null) {
  const last = c.lastMessage;
  if (!last) return "Start the conversation";
  if (last.deletedAt) return "Message removed";
  if (last.text && last.text.trim()) {
    const prefix = viewerId && last.senderId === viewerId ? "You: " : "";
    return `${prefix}${last.text.trim()}`;
  }
  if (last.mediaUrl) return "📎 Attachment";
  return "New message";
}

function conversationLabel(c: ApiConversation) {
  if (c.isGroup) return c.name?.trim() || "Group chat";
  return c.otherUser?.displayName?.trim() || c.otherUser?.username || "Unknown";
}

export function DMWidget() {
  const router = useRouter();
  const open = useDmWidgetStore((s) => s.open);
  const setOpen = useDmWidgetStore((s) => s.setOpen);
  const [activeStatusOpen, setActiveStatusOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadViewer() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (alive && data?.user?.id) setViewerId(data.user.id as string);
      } catch {
        /* ignore */
      }
    }

    async function loadConversations() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/conversations", { cache: "no-store" });
        if (!res.ok) {
          throw new Error("Could not load conversations.");
        }
        const data = await res.json().catch(() => null);
        if (!alive) return;
        const rows = Array.isArray(data?.conversations) ? (data.conversations as ApiConversation[]) : [];
        setConversations(rows);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Could not load conversations.");
        setConversations([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    if (open) {
      void loadViewer();
      void loadConversations();

      // Realtime: piggy-back on AppShell's existing conversations SSE via
      // the `linksy:conversations-activity` window event. No second
      // EventSource — opening one would push us past Chrome's HTTP/1.1
      // 6-per-origin cap and queue POSTs indefinitely.
      const onActivity = () => { void loadConversations(); };
      window.addEventListener("linksy:conversations-activity", onActivity);
      const backupId = window.setInterval(loadConversations, 5000);
      return () => {
        alive = false;
        window.removeEventListener("linksy:conversations-activity", onActivity);
        window.clearInterval(backupId);
      };
    }

    void loadConversations();
    return () => {
      alive = false;
    };
  }, [open]);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread || 0), 0),
    [conversations],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      const label = conversationLabel(c).toLowerCase();
      const handle = c.otherUser?.username?.toLowerCase() ?? "";
      const lastText = c.lastMessage?.text?.toLowerCase() ?? "";
      return label.includes(q) || handle.includes(q) || lastText.includes(q);
    });
  }, [conversations, search]);

  const recentContacts = useMemo(() => {
    const seen = new Set<string>();
    const out: ConversationUser[] = [];
    for (const c of conversations) {
      if (c.isGroup || !c.otherUser) continue;
      if (seen.has(c.otherUser.id)) continue;
      seen.add(c.otherUser.id);
      out.push(c.otherUser);
      if (out.length >= 6) break;
    }
    return out;
  }, [conversations]);

  function openConversation(id: string) {
    router.push(`/messages?conversation=${encodeURIComponent(id)}`);
    setOpen(false);
  }

  function startNewMessage() {
    router.push("/messages");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" className={ui.dmBubble} onClick={() => setOpen(true)} aria-label="Open messages">
        <MessageCircle width={24} height={24} strokeWidth={1.9} aria-hidden />
        {totalUnread > 0 && <span className={ui.dmBubbleBadge}>{totalUnread}</span>}
      </button>
    );
  }

  return (
    <div className="dm-widget">
      <div className="dm-win-header">
        <span className="dm-win-title">Messages</span>
        <div className="dm-win-actions">
          <button className="dm-win-btn" aria-label="Open messages screen" title="Open full messages" onClick={startNewMessage}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
          <button className="dm-win-btn" onClick={() => setOpen(false)} aria-label="Close messages">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="22" height="22">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="dm-search-wrap">
        <svg className="dm-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
          <circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 4.5 4.5"/>
        </svg>
        <input
          className="dm-search"
          placeholder="Search messages..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {recentContacts.length > 0 && (
        <div className="dm-active-section">
          <div className="dm-active-header">
            <span className="dm-active-title">
              <span className="dm-active-dot" />
              Recent contacts
            </span>
            <button
              className="dm-active-toggle"
              onClick={() => setActiveStatusOpen(v => !v)}
              aria-label={activeStatusOpen ? "Hide recent contacts" : "Show recent contacts"}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="18" height="18">
                {activeStatusOpen ? <path d="M18 15 12 9 6 15"/> : <path d="M6 9l6 6 6-6"/>}
              </svg>
            </button>
          </div>
          {activeStatusOpen && (
            <div className="dm-active-list">
              {recentContacts.map(u => {
                const label = u.displayName?.trim() || u.username;
                const avatar = displayMediaSrc(u.avatarUrl) ?? u.avatarUrl;
                return (
                  <button
                    key={u.id}
                    className="dm-active-av-wrap"
                    title={label}
                    onClick={() => {
                      router.push(`/messages?userId=${encodeURIComponent(u.id)}`);
                      setOpen(false);
                    }}
                  >
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" className="dm-active-av" style={{ objectFit: "cover" }} />
                    ) : (
                      <div className="dm-active-av" style={{ background: AVATAR_PLACEHOLDER_GRADIENT }}>{initialsFor(label)}</div>
                    )}
                    <span className="dm-active-av-name">{label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="dm-convos">
        {loading && conversations.length === 0 ? (
          <div className="dm-empty" style={{ padding: "1rem", color: "var(--muted)", fontSize: "0.85rem" }}>
            Loading...
          </div>
        ) : error ? (
          <div className="dm-empty" style={{ padding: "1rem", color: "var(--muted)", fontSize: "0.85rem" }}>
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="dm-empty" style={{ padding: "1rem", color: "var(--muted)", fontSize: "0.85rem" }}>
            {search.trim() ? "No conversations match your search." : "No conversations yet. Start a new message!"}
          </div>
        ) : (
          filtered.map(c => {
            const label = conversationLabel(c);
            const avatar = !c.isGroup && c.otherUser?.avatarUrl
              ? displayMediaSrc(c.otherUser.avatarUrl) ?? c.otherUser.avatarUrl
              : null;
            const preview = previewFor(c, viewerId);
            const time = c.lastMessage ? formatRelativeTime(c.lastMessage.createdAt) : formatRelativeTime(c.updatedAt);
            const unread = c.unread > 0;
            return (
              <button
                key={c.id}
                className="dm-convo"
                onClick={() => openConversation(c.id)}
              >
                <div className="dm-convo-av-wrap">
                  {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" className="dm-convo-av" style={{ objectFit: "cover" }} />
                  ) : (
                    <div className="dm-convo-av" style={{ background: AVATAR_PLACEHOLDER_GRADIENT }}>{initialsFor(label)}</div>
                  )}
                </div>
                <div className="dm-convo-body">
                  <div className="dm-convo-top">
                    <span className="dm-convo-name">{label}</span>
                    {time && <span className="dm-convo-time">{time}</span>}
                  </div>
                  <div className="dm-convo-bottom">
                    <span className={`dm-convo-msg${unread ? " dm-convo-msg--unread" : ""}`}>{preview}</span>
                    {unread && <span className="dm-convo-badge">{c.unread}</span>}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
