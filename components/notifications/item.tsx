"use client";

import { displayMediaSrc } from "@/lib/media";
import type { NotificationItem } from "./notification-model";
import type { NotificationsScreenStrings } from "@/lib/i18n/notifications-screen-copy";
import { useEffect, useRef } from "react";

type Props = {
  item: NotificationItem;
  isFollowing: boolean;
  strings: NotificationsScreenStrings;
  onOpen: (item: NotificationItem) => void;
  onMarkRead: (id: string) => void;
  onToggleFollow: (notifId: string, fromId: string) => void;
};

export function NotificationItemRow({ item, isFollowing, strings, onOpen, onMarkRead, onToggleFollow }: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const viewMarkedRef = useRef(false);

  useEffect(() => {
    viewMarkedRef.current = false;
  }, [item.id, item.unread]);

  useEffect(() => {
    if (!item.unread) return;
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.45 && !viewMarkedRef.current) {
            viewMarkedRef.current = true;
            onMarkRead(item.id);
          }
        }
      },
      { threshold: [0, 0.45, 0.9] },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [item.id, item.unread, onMarkRead]);

  return (
    <article
      ref={rootRef}
      className={`ntf-item${item.unread ? " ntf-item--unread" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(item);
        }
      }}
    >
      {item.groupStack && item.groupStack.length > 1 ? (
        <div className="ntf-avatar-stack" aria-hidden="true">
          {item.groupStack.map((face, index) =>
            face.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${item.id}-g-${index}`}
                src={displayMediaSrc(face.avatarUrl) ?? face.avatarUrl}
                alt=""
                className="ntf-avatar ntf-avatar--img ntf-avatar--stacked"
                style={{ zIndex: item.groupStack!.length - index }}
              />
            ) : (
              <div
                key={`${item.id}-g-${index}`}
                className="ntf-avatar ntf-avatar--stacked"
                style={{ background: face.grad, zIndex: item.groupStack!.length - index }}
              >
                {face.initials}
              </div>
            ),
          )}
        </div>
      ) : item.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayMediaSrc(item.avatarUrl) ?? item.avatarUrl}
          alt={item.actor}
          className="ntf-avatar ntf-avatar--img"
        />
      ) : (
        <div className="ntf-avatar" style={{ background: item.avatarGrad }}>
          {item.initials}
        </div>
      )}

      <div className="ntf-item-body">
        <p className="ntf-item-message">
          <strong>{item.actor}</strong> {item.action}
        </p>

        <div className="ntf-item-meta">
          <span>{item.time}</span>
          {item.unread ? <span className="ntf-item-dot" aria-hidden="true" /> : null}
          {item.unread ? (
            <button
              type="button"
              className="ntf-mark-btn"
              onClick={(event) => {
                event.stopPropagation();
                onMarkRead(item.id);
              }}
            >
              {strings.markRead}
            </button>
          ) : null}
        </div>
      </div>

      <div className="ntf-item-side">
        {item.actionButton?.kind === "follow" ? (
          <button
            type="button"
            className={`ntf-follow-btn${isFollowing ? " ntf-follow-btn--done" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFollow(item.id, item.fromId);
            }}
            aria-pressed={isFollowing}
          >
            {isFollowing ? item.actionButton.activeLabel ?? item.actionButton.label : item.actionButton.label}
          </button>
        ) : item.preview ? (
          <button
            type="button"
            className="ntf-preview ntf-preview--post"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(item);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayMediaSrc(item.preview.mediaUrl) ?? item.preview.mediaUrl}
              alt=""
              className="ntf-preview-image"
            />
            <span>{item.preview.label}</span>
          </button>
        ) : null}
      </div>
    </article>
  );
}
