"use client";

import { AVATAR_PLACEHOLDER_GRADIENT } from "@/lib/avatar-placeholder";
import { displayMediaSrc } from "@/lib/media";
import { userProfileHref } from "@/lib/user-url";
import Link from "next/link";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/lib/use-focus-trap";

export type ApiNotif = {
  id: string;
  type: string;
  read: boolean;
  createdAt: string;
  from: { id: string; username: string; displayName: string; avatarUrl: string | null };
  post: { id: string; mediaUrls: string[] } | null;
  story?: { id: string; mediaUrl: string } | null;
};

export function fmtNt(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

const NT_MAP: Record<string, string> = {
  like: "liked your post",
  comment: "commented on your post",
  follow: "started following you",
  mention: "mentioned you",
  post_mention: "mentioned you in a post",
  story_mention: "mentioned you in a story",
  story: "shared a story update",
  message: "sent you a message",
  message_request: "sent you a message request",
  story_expiring: "your story expires in about an hour",
  friend_joined: "joined Linksy from your contacts",
  story_reaction: "reacted to your story",
  story_collab: "added you as a collaborator on a story",
};

export function notifHref(n: ApiNotif) {
  if (n.type === "follow" || n.type === "friend_joined") return userProfileHref(n.from);
  if (n.type === "message_request" || n.type === "message") return "/messages";
  if (n.post?.id) return `/post/${encodeURIComponent(n.post.id)}`;
  if (n.story?.id) return `/story/${encodeURIComponent(n.story.id)}`;
  return "/notifications";
}

export function NotifDropdown({
  anchorEl,
  notifs,
  unreadCount,
  onClose,
  onMarkAllRead,
  onOpenNotif,
}: {
  anchorEl: HTMLElement | null;
  notifs: ApiNotif[];
  unreadCount: number;
  onClose: () => void;
  onMarkAllRead: () => void;
  onOpenNotif: (notif: ApiNotif) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: "hidden" });
  useFocusTrap(Boolean(anchorEl), ref);

  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const isRight = rect.left > window.innerWidth / 2;
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - 470));
    setPos(isRight
      ? { position: "fixed", top, right: window.innerWidth - rect.left + 10, visibility: "visible" }
      : { position: "fixed", top, left: rect.right + 10, visibility: "visible" }
    );
    const onPD = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPD);
    return () => document.removeEventListener("pointerdown", onPD);
  }, [anchorEl, onClose]);

  return (
    <div
      ref={ref}
      className="notif-dd"
      style={pos}
      role="dialog"
      aria-modal="true"
      aria-label="Notifications preview"
    >
      <div className="notif-dd-head">
        <span className="notif-dd-title" id="feed-notif-dd-title">Notifications</span>
        <button type="button" className="notif-dd-markall" onClick={onMarkAllRead} disabled={unreadCount === 0}>Mark all read</button>
      </div>
      <div className="notif-dd-list" aria-labelledby="feed-notif-dd-title">
        {notifs.length === 0 ? (
          <div className="notif-dd-empty">No notifications yet</div>
        ) : notifs.map(n => {
          const grad = AVATAR_PLACEHOLDER_GRADIENT;
          const name = n.from.displayName || n.from.username;
          const ini = name.slice(0, 2).toUpperCase();
          return (
            <button
              type="button"
              key={n.id}
              className={`notif-dd-item${!n.read ? " notif-dd-item--unread" : ""}`}
              onClick={() => onOpenNotif(n)}
              aria-label={`${name}: ${NT_MAP[n.type] ?? "notification"}`}
            >
              {n.from.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={displayMediaSrc(n.from.avatarUrl) ?? n.from.avatarUrl} alt="" className="notif-dd-avatar notif-dd-avatar--img" />
              ) : (
                <div className="notif-dd-avatar" style={{ background: grad }} aria-hidden="true">{ini}</div>
              )}
              <div className="notif-dd-body">
                <p className="notif-dd-text"><strong aria-hidden="true">{name}</strong> <span aria-hidden="true">{NT_MAP[n.type] ?? n.type}</span></p>
                <span className="notif-dd-time">{fmtNt(n.createdAt)}</span>
              </div>
              {!n.read ? <span className="notif-dd-dot" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <Link href="/notifications" onClick={onClose} className="notif-dd-seeall">See all notifications</Link>
    </div>
  );
}
