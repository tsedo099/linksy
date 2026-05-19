"use client";

import React, { memo, useState } from "react";
import Image from "next/image";
import { extractVoiceWaveform, getMediaUrl, isAudioMediaUrl, isImageMediaUrl, isVideoMediaUrl, stripVoiceWaveform, displayMediaSrc } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import type { MessagesScreenStrings } from "@/lib/i18n/messages-screen-copy";
import { Av } from "./avatar";
import { VoicePlayer } from "./voice-player";
import { IcForward, IcMore, IcPin, IcReact, IcReply, IcTrash } from "./icons";
import { type ApiMessage, MESSAGE_EDIT_WINDOW_MS, clockOf, colorFor } from "./types";

export const Bubble = memo(function Bubble({
  msg,
  myId,
  showAv,
  locale,
  ms,
  onReply,
  onReact,
  onForward,
  onTogglePin,
  onUnsend,
  onDeleteForMe,
  onEdit,
  isPinned,
  isHighlighted,
  openMoreMenuFor,
  setOpenMoreMenuFor,
  openReactionPickerFor,
  setOpenReactionPickerFor,
}: {
  msg: ApiMessage;
  myId: string;
  showAv: boolean;
  locale: string;
  ms: MessagesScreenStrings;
  onReply: (msg: ApiMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onForward: (msg: ApiMessage) => void;
  onTogglePin: (messageId: string) => void;
  onUnsend: (msg: ApiMessage) => void;
  onDeleteForMe: (msg: ApiMessage) => void;
  onEdit: (msg: ApiMessage) => void;
  isPinned: boolean;
  isHighlighted: boolean;
  openMoreMenuFor: string | null;
  setOpenMoreMenuFor: (id: string | null) => void;
  openReactionPickerFor: string | null;
  setOpenReactionPickerFor: (id: string | null) => void;
}) {
  const showMoreMenu = openMoreMenuFor === msg.id;
  const showReactionPicker = openReactionPickerFor === msg.id;
  const isMe = msg.senderId === myId;
  const isDeleted = Boolean(msg.deletedAt);
  const isEdited = Boolean(msg.editedAt) && !isDeleted;
  // Adult-content gate state. Three cases:
  //   - `adultContentRedacted` → server stripped the body because viewer is
  //     under 18; no reveal possible.
  //   - `containsAdultContent` + not own message + not yet revealed →
  //     "Show anyway?" prompt instead of the body.
  //   - Otherwise → render normally.
  const adultFlag = msg.containsAdultContent === true;
  const adultRedacted = msg.adultContentRedacted === true;
  const adultGateNeeded = adultFlag && !adultRedacted && !isMe && !isDeleted;
  const [adultRevealed, setAdultRevealed] = useState(false);
  const hideBodyForGate = adultGateNeeded && !adultRevealed;
  const hasContent = isDeleted || msg.text.trim() || msg.mediaUrl || msg.replyTo || adultFlag;
  if (!hasContent) return null;
  const mediaUrl = isDeleted ? null : getMediaUrl(msg.mediaUrl);
  const mediaSrc = mediaUrl ? (displayMediaSrc(mediaUrl) ?? mediaUrl) : null;
  const mediaIsAudio = isAudioMediaUrl(mediaUrl);
  const mediaIsVideo = !mediaIsAudio && isVideoMediaUrl(mediaUrl);
  const mediaIsImage = !mediaIsAudio && isImageMediaUrl(mediaUrl);
  const hasOnlyMedia = Boolean((mediaIsVideo || mediaIsImage || mediaIsAudio) && !msg.text.trim());
  const audioWaveform = mediaIsAudio ? extractVoiceWaveform(mediaUrl) : null;
  const audioSrc = mediaIsAudio ? stripVoiceWaveform(mediaUrl) : null;
  const groupedReactions = isDeleted ? [] : Object.entries(
    (msg.reactions ?? []).reduce<Record<string, number>>((acc, reaction) => {
      acc[reaction.emoji] = (acc[reaction.emoji] ?? 0) + 1;
      return acc;
    }, {}),
  );
  const quickEmojis = ["❤️", "👍", "😂", "🔥", "😮"];
  const canEdit = isMe
    && !isDeleted
    && !msg.mediaUrl
    && Date.now() - new Date(msg.createdAt).getTime() < MESSAGE_EDIT_WINDOW_MS;
  return (
    <div
      className={`ms-row ${isMe ? "ms-row--me" : "ms-row--them"}${isHighlighted ? " ms-row--highlight" : ""}`}
      data-message-id={msg.id}
      onClick={(event) => event.stopPropagation()}
    >
      {!isMe && (
        <div className="ms-row-av">
          {showAv
            ? <Av name={msg.sender.displayName} uid={msg.sender.id} avatarUrl={msg.sender.avatarUrl} size={28} />
            : <span style={{ width: 28 }} />}
        </div>
      )}
      <div className="ms-bubble-wrap">
        {!isDeleted && msg.replyTo ? (
          <div className={`ms-reply-label ${isMe ? "ms-reply-label--me" : "ms-reply-label--them"}`}>
            <span className="ms-reply-label-line">
              {isMe ? ms.bubbleYouReplied(msg.replyTo.senderName) : ms.bubbleTheyReplied(msg.sender.displayName)}
            </span>
            {msg.replyTo.preview ? (
              <span className="ms-reply-label-preview">{msg.replyTo.preview}</span>
            ) : null}
          </div>
        ) : null}
        <div className={`ms-bubble ${isMe ? "ms-bubble--me" : "ms-bubble--them"} ${hasOnlyMedia ? "ms-bubble--media-only" : ""} ${isDeleted ? "ms-bubble--deleted" : ""}`}
          style={isMe ? { "--mc": colorFor(myId) } as React.CSSProperties : undefined}>
          {isDeleted ? (
            <span className="ms-bubble-text" style={{ fontStyle: "italic", opacity: 0.6 }}>
              {isMe ? ms.bubbleYouUnsent : ms.bubbleMsgUnsent}
            </span>
          ) : adultRedacted ? (
            <span
              className="ms-bubble-text"
              style={{ fontStyle: "italic", opacity: 0.75, display: "flex", alignItems: "center", gap: 6 }}
              aria-label="Adult content restricted for under-18"
            >
              <span aria-hidden>🔞</span>
              {ms.adultContentRestricted ?? "Restricted: this message is hidden because your account is under 18."}
            </span>
          ) : hideBodyForGate ? (
            <button
              type="button"
              className="ms-bubble-text"
              onClick={() => setAdultRevealed(true)}
              style={{
                fontStyle: "italic",
                opacity: 0.95,
                background: "transparent",
                border: "1px dashed currentColor",
                borderRadius: 8,
                padding: "10px 12px",
                cursor: "pointer",
                color: "inherit",
                font: "inherit",
                textAlign: "left",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
              aria-label="Reveal adult content"
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600 }}>
                <span aria-hidden>🔞</span>
                {ms.adultContentArrived ?? "Adult content arrived — sure you want to view?"}
              </span>
              <span style={{ fontSize: 12, opacity: 0.8 }}>
                {ms.adultContentTapToShow ?? "Tap to show"}
              </span>
            </button>
          ) : (
            <>
              {mediaIsAudio && audioSrc ? (
                <VoicePlayer
                  src={audioSrc}
                  peaks={audioWaveform ?? []}
                  variant={isMe ? "me" : "them"}
                  playLabel={ms.voicePlay}
                  pauseLabel={ms.voicePause}
                />
              ) : (mediaIsVideo || mediaIsImage) ? (
                <div className="ms-bubble-media-wrap">
                  {mediaIsVideo ? (
                    <video src={mediaSrc ?? undefined} className="ms-bubble-media" controls playsInline preload="metadata" />
                  ) : (
                    <Image
                      src={mediaSrc ?? ""}
                      className="ms-bubble-media"
                      alt=""
                      width={800}
                      height={800}
                      sizes="(max-width: 520px) 85vw, 360px"
                      unoptimized={shouldUnoptimizeNextImageSrc(mediaSrc ?? "")}
                    />
                  )}
                </div>
              ) : null}
              {msg.text ? <span className="ms-bubble-text">{msg.text}</span> : null}
            </>
          )}
          <span className="ms-bubble-time">
            {clockOf(msg.createdAt, locale)}
            {isEdited ? <span className="ms-bubble-edited" style={{ marginLeft: 4, opacity: 0.7 }}>{ms.edited}</span> : null}
          </span>
        </div>
        {isDeleted ? null : (
          <div className="ms-bubble-actions">
            <button
              type="button"
              className="ms-bubble-action-btn"
              onClick={() => {
                setOpenReactionPickerFor(null);
                setOpenMoreMenuFor(showMoreMenu ? null : msg.id);
              }}
              title={ms.moreTitle}
            >
              <IcMore />
            </button>
            <button type="button" className="ms-bubble-action-btn" onClick={() => onReply(msg)} title={ms.replyTitle}>
              <IcReply />
            </button>
            <button
              type="button"
              className="ms-bubble-action-btn"
              onClick={() => setOpenReactionPickerFor(showReactionPicker ? null : msg.id)}
              title={ms.reactTitle}
            >
              <IcReact />
            </button>
          </div>
        )}
        {showMoreMenu && !isDeleted ? (
          <div className="ms-more-menu">
            <div className="ms-more-menu-time">{clockOf(msg.createdAt, locale)}</div>
            <button type="button" className="ms-more-menu-item" onClick={() => { onForward(msg); setOpenMoreMenuFor(null); }}>
              <span>{ms.forward}</span>
              <IcForward />
            </button>
            <button type="button" className="ms-more-menu-item" onClick={() => { onTogglePin(msg.id); setOpenMoreMenuFor(null); }}>
              <span>{isPinned ? ms.unpin : ms.pin}</span>
              <IcPin />
            </button>
            {canEdit ? (
              <button type="button" className="ms-more-menu-item" onClick={() => { onEdit(msg); setOpenMoreMenuFor(null); }}>
                <span>{ms.edit}</span>
                <IcReply />
              </button>
            ) : null}
            <button type="button" className="ms-more-menu-item" onClick={() => { onDeleteForMe(msg); setOpenMoreMenuFor(null); }}>
              <span>{ms.deleteForYou}</span>
              <IcTrash />
            </button>
            {isMe ? (
              <button type="button" className="ms-more-menu-item ms-more-menu-item--danger" onClick={() => { onUnsend(msg); setOpenMoreMenuFor(null); }}>
                <span>{ms.unsend}</span>
                <IcTrash />
              </button>
            ) : null}
          </div>
        ) : null}
        {showReactionPicker ? (
          <div className="ms-reaction-picker">
            {quickEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="ms-reaction-picker-btn"
                onClick={() => {
                  onReact(msg.id, emoji);
                  setOpenReactionPickerFor(null);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
        {groupedReactions.length > 0 ? (
          <div className="ms-reaction-strip">
            {groupedReactions.map(([emoji, count]) => (
              <span key={emoji} className="ms-reaction-chip">{emoji} {count}</span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});
