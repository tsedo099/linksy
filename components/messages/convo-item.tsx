"use client";

import React from "react";
import { Pin, MoreHorizontal } from "lucide-react";
import { isAudioMediaUrl, isVideoMediaUrl } from "@/lib/media";
import type { MessagesScreenStrings } from "@/lib/i18n/messages-screen-copy";
import { messagesScreenTimeAgo } from "@/lib/i18n/messages-screen-copy";
import type { AppLanguage } from "@/lib/language";
import { Av } from "./avatar";
import { ICON_STROKE } from "./icons";
import type { ApiConvo } from "./types";

export function ConvoItem({
  c,
  active,
  language,
  ms,
  myId,
  onClick,
  titleOverride,
  muted,
  pinnedToTop,
  markUnread,
  onContextMenu,
}: {
  c: ApiConvo;
  active: boolean;
  language: AppLanguage;
  ms: MessagesScreenStrings;
  myId: string;
  onClick: () => void;
  titleOverride?: string;
  muted?: boolean;
  pinnedToTop?: boolean;
  markUnread?: boolean;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const displayName = titleOverride ?? (c.isGroup ? (c.name ?? ms.groupFallback) : (c.otherUser?.displayName ?? "?"));
  const uid = c.otherUser?.id ?? c.id;
  const avatarUrl = c.isGroup ? null : c.otherUser?.avatarUrl;
  const preview = c.lastMessage
    ? (c.lastMessage.senderId === myId ? ms.youPrefix : "")
      + (c.lastMessage.deletedAt
          ? ms.msgDeleted
          : (c.lastMessage.text || (c.lastMessage.mediaUrl ? (isAudioMediaUrl(c.lastMessage.mediaUrl) ? ms.voiceMsg : isVideoMediaUrl(c.lastMessage.mediaUrl) ? ms.video : ms.photo) : "")))
    : ms.startChat;
  const previewBold = Boolean(c.unread || markUnread);
  const unreadBadge = c.unread > 0 ? c.unread : markUnread ? 1 : 0;
  return (
    <div
      className={`ms-item ${active ? "ms-item--on" : ""}`}
      onContextMenu={onContextMenu}
    >
      <button type="button" className="ms-item-hit" onClick={onClick}>
        <Av name={displayName} uid={uid} avatarUrl={avatarUrl} size={44} isGroup={c.isGroup} />
        <div className="ms-item-body">
          <div className="ms-item-top">
            <span className="ms-item-name">
              {displayName}
              {pinnedToTop ? (
                <Pin className="ms-item-pin-ico" size={12} strokeWidth={2} aria-hidden />
              ) : null}
            </span>
            {c.lastMessage && <span className="ms-item-time">{messagesScreenTimeAgo(c.lastMessage.createdAt, language)}</span>}
          </div>
          <div className="ms-item-bottom">
            <span className={`ms-item-preview ${previewBold ? "ms-item-preview--bold" : ""}`}>
              {muted ? ms.mutedDash : ""}
              {preview}
            </span>
            {unreadBadge > 0 && <span className="ms-unread">{unreadBadge}</span>}
          </div>
        </div>
      </button>
      <button
        type="button"
        className="ms-item-more"
        aria-label={ms.convoMenuAria}
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu?.(e);
        }}
      >
        <MoreHorizontal size={18} strokeWidth={ICON_STROKE} aria-hidden />
      </button>
    </div>
  );
}
