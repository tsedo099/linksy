"use client";

import { useLanguagePreferences } from "@/components/language-provider";
import { AVATAR_PLACEHOLDER_GRADIENT } from "@/lib/avatar-placeholder";
import { MentionRichText } from "@/components/mention-rich-text";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type CommentItem = {
  id: number | string;
  user: string;
  initials: string;
  grad: string;
  text: string;
  time: string;
  liked: boolean;
  moderationStatus?: "APPROVED" | "PENDING" | "REJECTED";
};

type ModerationPreview = {
  action: "allow" | "warn" | "quarantine" | "block";
  userMessage: string | null;
  score: number;
};

export function CommentsDrawer({ onClose, postId, postAuthor, postCaption, postGrad, postImageUrl, postMediaGrad, commentsEnabled = true }: {
  onClose: () => void;
  postId?: string;
  postAuthor?: string;
  postCaption?: string;
  postGrad?: string;
  postImageUrl?: string;
  postMediaGrad?: string;
  /** When false, list stays readable but adding comments is blocked (server also enforces). */
  commentsEnabled?: boolean;
}) {
  const { locale } = useLanguagePreferences();
  const [input, setInput] = useState("");
  // Start empty — the BASE_COMMENTS placeholder list was leaking into prod
  // and looked like fake seed data on real users' posts.
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [likedIds, setLikedIds] = useState<Set<CommentItem["id"]>>(new Set());
  const [preview, setPreview] = useState<ModerationPreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const commentCount = comments.length;

  useEffect(() => {
    if (!postId) return;
    fetch(`/api/posts/${postId}/comments`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.comments?.length) {
          setComments(data.comments.map((c: {
            id: string;
            author: { displayName: string };
            text: string;
            createdAt: string;
            moderationStatus?: "APPROVED" | "PENDING" | "REJECTED";
          }) => ({
            id: c.id, user: c.author.displayName, initials: c.author.displayName.slice(0, 2).toUpperCase(),
            grad: AVATAR_PLACEHOLDER_GRADIENT, text: c.text,
            time: new Date(c.createdAt).toLocaleDateString(locale), liked: false,
            moderationStatus: c.moderationStatus,
          })));
        }
      })
      .catch(() => {});
  }, [locale, postId]);

  useEffect(() => {
    const text = input.trim();
    if (!text) {
      setPreview(null);
      setNotice(null);
      return;
    }

    let alive = true;
    const id = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/comments/moderate-preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = (await response.json().catch(() => null)) as { moderation?: ModerationPreview } | null;
        if (alive && data?.moderation) setPreview(data.moderation);
      } catch {
        if (alive) setPreview(null);
      }
    }, 260);

    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [input]);

  const submitComment = async () => {
    if (!commentsEnabled) return;
    if (!input.trim()) return;
    if (preview?.action === "block") {
      setNotice(preview.userMessage ?? "This comment cannot be posted.");
      return;
    }
    const text = input;
    setInput("");
    if (postId) {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json().catch(() => null)) as {
        comment?: {
          id: string;
          author: { displayName: string };
          text: string;
          createdAt: string;
          moderationStatus?: "APPROVED" | "PENDING" | "REJECTED";
        };
        safety?: ModerationPreview;
        warning?: { warningsInWindow: number; banApplied: boolean; banUntil: string | null } | null;
        error?: string;
        banUntil?: string;
      } | null;
      if (res.status === 403 && data?.banUntil) {
        setInput(text);
        setNotice(`Commenting paused until ${new Date(data.banUntil).toLocaleString()}.`);
        return;
      }
      if (!res.ok || !data?.comment) {
        setInput(text);
        setNotice(data?.error ?? "Could not post comment.");
        return;
      }
      const created = data.comment;
      setComments(prev => [...prev, {
        id: created.id,
        user: created.author.displayName,
        initials: created.author.displayName.slice(0, 2).toUpperCase(),
        grad: AVATAR_PLACEHOLDER_GRADIENT,
        text: created.text,
        time: "now",
        liked: false,
        moderationStatus: created.moderationStatus,
      }]);
      const warning = data.warning;
      setNotice(
        warning
          ? `Warning issued (${warning.warningsInWindow}/3). Repeated warnings pause commenting for a week.`
          : data.safety?.userMessage ?? (created.moderationStatus === "PENDING" ? "Comment sent for review." : null),
      );
    } else {
      const newComment: CommentItem = { id: Date.now(), user: "Me", initials: "ME", grad: AVATAR_PLACEHOLDER_GRADIENT, text, time: "now", liked: false };
      setComments(prev => [...prev, newComment]);
    }
    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }), 50);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return createPortal(
    <div className="cd-overlay" onClick={onClose}>
      <div className="cd-drawer" onClick={e => e.stopPropagation()}>

        {/* ── Post media banner ── */}
        <div className="cd-media"
          style={postImageUrl
            ? { backgroundImage: `url(${postImageUrl})` }
            : { background: postMediaGrad ?? postGrad ?? "linear-gradient(135deg,#1e1b4b,#312e81)" }
          }
        >
          <button className="cd-media-close" onClick={onClose} aria-label="Close">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="14" height="14">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
          <div className="cd-media-overlay">
            <div className="cd-media-author">
              <div className="cd-media-avatar" style={{ background: postGrad ?? AVATAR_PLACEHOLDER_GRADIENT }}>
                {postAuthor ? postAuthor.slice(0, 2).toUpperCase() : "—"}
              </div>
              <div className="cd-media-info">
                <span className="cd-media-name">{postAuthor ?? "Post"}</span>
                {postCaption && <span className="cd-media-caption">{postCaption}</span>}
              </div>
            </div>
            <span className="cd-media-count">{commentCount}</span>
          </div>
        </div>

        {/* ── Comment list ── */}
        <div className="cd-list" ref={listRef}>
          {comments.map(c => (
            <div key={c.id} className="cd-row">
              <div className="cd-avatar" style={{ background: c.grad }}>{c.initials}</div>
              <div className="cd-content">
                <div className="cd-name-row">
                  <span className="cd-username">{c.user}</span>
                  <span className="cd-time">{c.time}</span>
                </div>
                <p className="cd-text"><MentionRichText text={c.text} /></p>
                {c.moderationStatus === "PENDING" ? <span className="cd-mod-badge">Pending review</span> : null}
                <div className="cd-actions">
                  <button
                    type="button"
                    className={`cd-action-like${likedIds.has(c.id) ? " cd-action-like--on" : ""}`}
                    onClick={() => setLikedIds(s => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill={likedIds.has(c.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" width="12" height="12">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                    {likedIds.has(c.id) && <span>1</span>}
                  </button>
                  <button type="button" className="cd-action-reply">Reply</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Input ── */}
        {commentsEnabled ? (
        <>
        {notice || (preview && preview.action !== "allow" && preview.userMessage) ? (
          <div className={`cd-safety-note${preview?.action === "block" ? " cd-safety-note--block" : ""}`}>
            {notice ?? preview?.userMessage}
          </div>
        ) : null}
        <div className="cd-input-row">
          <div className="cd-input-avatar" style={{ background: AVATAR_PLACEHOLDER_GRADIENT }}>ME</div>
          <div className="cd-input-shell">
            <input
              className="cd-input"
              placeholder="Add a comment…"
              value={input}
              onChange={e => { setInput(e.target.value); setNotice(null); }}
              onKeyDown={e => { if (e.key === "Enter") submitComment(); }}
            />
            <button
              className={`cd-send-btn${input.trim() && preview?.action !== "block" ? " cd-send-btn--ready" : ""}`}
              disabled={!input.trim() || preview?.action === "block"}
              onClick={submitComment}
              aria-label="Post"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
        </>
        ) : (
          <div className="cd-comments-closed">Comments are turned off for this post.</div>
        )}

      </div>
    </div>,
    document.body
  );
}
