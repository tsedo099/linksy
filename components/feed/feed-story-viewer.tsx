"use client";

import Image from "next/image";
import { useLanguagePreferences } from "@/components/language-provider";
import { NsfwChip } from "@/components/nsfw-chip";
import { displayMediaSrc, getMediaUrl, isImageMediaUrl, isVideoMediaUrl } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import { emitStoryViewed } from "@/lib/story-view-sync";
import { useCurrentUserStore } from "@/lib/stores/current-user";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/confirm-dialog";

import type { ApiStoryGroup, ApiStoryItem } from "./feed-story-model";
import { STORY_DURATION, STORY_GRADS } from "./feed-story-constants";

type StoryViewerEntry = {
  viewedAt: string;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
};

type StoryPreview = {
  group: ApiStoryGroup;
  item: ApiStoryItem;
  groupIdx: number;
};

const STORY_CAPTION_META_PREFIX = "[[linksy-story-caption:";
const STORY_CAPTION_META_SUFFIX = "]]";
const STORY_TEXT_COLORS = ["#ffffff", "#111827", "#ef4444", "#f97316", "#facc15", "#22c55e", "#38bdf8", "#6366f1", "#a855f7", "#ec4899"] as const;
const STORY_TEXT_COLOR_DEFAULT: string = STORY_TEXT_COLORS[0];
const STORY_DRAW_MAX_STROKES = 80;
const STORY_DRAW_MAX_POINTS = 180;
const STORY_HEART_REACTION = "❤️";

function normalizeStoryTextColor(value: unknown): string {
  return typeof value === "string" && (STORY_TEXT_COLORS as readonly string[]).includes(value) ? value : STORY_TEXT_COLOR_DEFAULT;
}

function isGradientStoryMedia(url?: string | null) {
  const value = getMediaUrl(url);
  return !value || value === "gradient" || value.startsWith("linear-gradient");
}

function adjacentStoryPreview(groups: ApiStoryGroup[], groupIdx: number, itemIdx: number, direction: "prev" | "next"): StoryPreview | null {
  if (direction === "prev") {
    const prevGroup = groups[groupIdx - 1];
    const prevItem = prevGroup?.stories[prevGroup.stories.length - 1];
    return prevGroup && prevItem ? { group: prevGroup, item: prevItem, groupIdx: groupIdx - 1 } : null;
  }

  const nextGroup = groups[groupIdx + 1];
  const nextItem = nextGroup?.stories[0];
  return nextGroup && nextItem ? { group: nextGroup, item: nextItem, groupIdx: groupIdx + 1 } : null;
}

function parseStoryCaption(rawCaption?: string | null) {
  const fallbackSticker = { id: "caption-0", text: rawCaption ?? "", x: 50, y: 50, width: 30, scale: 1, background: true, z: 1, color: STORY_TEXT_COLORS[0] };
  const fallback = { text: rawCaption ?? "", stickers: rawCaption ? [fallbackSticker] : [], drawStrokes: [] as Array<{ id: string; color: string; width: number; points: Array<{ x: number; y: number }> }> };
  if (!rawCaption?.startsWith(STORY_CAPTION_META_PREFIX)) return fallback;
  const metaEnd = rawCaption.indexOf(STORY_CAPTION_META_SUFFIX);
  if (metaEnd < 0) return fallback;
  try {
    const metaRaw = rawCaption.slice(STORY_CAPTION_META_PREFIX.length, metaEnd);
    const meta = JSON.parse(metaRaw) as { stickers?: unknown; draw?: unknown; x?: unknown; y?: unknown; w?: unknown; s?: unknown; bg?: unknown };
    const fallbackText = rawCaption.slice(metaEnd + STORY_CAPTION_META_SUFFIX.length).replace(/^\n/, "");
    const drawStrokes = Array.isArray(meta.draw)
      ? meta.draw.slice(0, STORY_DRAW_MAX_STROKES).flatMap((entry, index) => {
          if (!entry || typeof entry !== "object") return [];
          const item = entry as { c?: unknown; w?: unknown; p?: unknown };
          if (!Array.isArray(item.p)) return [];
          const points = item.p.slice(0, STORY_DRAW_MAX_POINTS).flatMap((point) => {
            if (!Array.isArray(point) || point.length < 2) return [];
            const x = Number(point[0]);
            const y = Number(point[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
            return [{ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) }];
          });
          if (points.length === 0) return [];
          const width = typeof item.w === "number" && Number.isFinite(item.w) ? Math.min(12, Math.max(1, item.w)) : 4;
          return [{ id: `draw-${index}`, color: normalizeStoryTextColor(item.c), width, points }];
        })
      : [];
    if (Array.isArray(meta.stickers)) {
      const stickers = meta.stickers.flatMap((entry, index) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as { t?: unknown; x?: unknown; y?: unknown; w?: unknown; s?: unknown; bg?: unknown; z?: unknown; c?: unknown };
        const text = typeof item.t === "string" ? item.t : "";
        if (!text.trim()) return [];
        return [{
          id: `caption-${index}`,
          text,
          x: typeof item.x === "number" && Number.isFinite(item.x) ? Math.min(88, Math.max(12, item.x)) : 50,
          y: typeof item.y === "number" && Number.isFinite(item.y) ? Math.min(86, Math.max(14, item.y)) : 50,
          width: typeof item.w === "number" && Number.isFinite(item.w) ? Math.min(72, Math.max(14, item.w)) : 30,
          scale: typeof item.s === "number" && Number.isFinite(item.s) ? Math.min(2.4, Math.max(0.55, item.s)) : 1,
          background: item.bg !== 0,
          z: typeof item.z === "number" && Number.isFinite(item.z) ? Math.max(1, Math.round(item.z)) : index + 1,
          color: normalizeStoryTextColor(item.c),
        }];
      });
      return { text: stickers.map((sticker) => sticker.text).join("\n") || (drawStrokes.length > 0 ? "Drawing" : ""), stickers, drawStrokes };
    }
    const x = typeof meta.x === "number" && Number.isFinite(meta.x) ? Math.min(88, Math.max(12, meta.x)) : 50;
    const y = typeof meta.y === "number" && Number.isFinite(meta.y) ? Math.min(86, Math.max(14, meta.y)) : 50;
    const width = typeof meta.w === "number" && Number.isFinite(meta.w) ? Math.min(72, Math.max(14, meta.w)) : 30;
    const scale = typeof meta.s === "number" && Number.isFinite(meta.s) ? Math.min(2.4, Math.max(0.55, meta.s)) : 1;
    return { text: fallbackText, stickers: fallbackText ? [{ id: "caption-0", text: fallbackText, x, y, width, scale, background: meta.bg !== 0, z: 1, color: normalizeStoryTextColor((meta as { c?: unknown }).c) }] : [], drawStrokes };
  } catch {
    return fallback;
  }
}

export function StoryViewer({ groups, startIdx, viewerId: viewerIdProp, onClose, onViewed, onDeleted }: {
  groups: ApiStoryGroup[];
  startIdx: number;
  /** When omitted, uses `useCurrentUserStore` (same source as nav avatar / feed). */
  viewerId?: string | null;
  onClose: () => void;
  onViewed?: (storyId: string, authorId: string) => void;
  onDeleted?: (storyId: string, authorId: string) => void;
}) {
  const { locale } = useLanguagePreferences();
  const confirm = useConfirm();
  const viewerIdFromStore = useCurrentUserStore((s) => s.user?.id ?? null);
  const viewerId = viewerIdProp ?? viewerIdFromStore;
  const [idx, setIdx] = useState(startIdx);
  const [itemIdx, setItemIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const group = groups[idx];
  const item = group?.stories[itemIdx];
  const rawStoryMedia = getMediaUrl(item?.mediaUrl);
  const storyMediaSrc = rawStoryMedia ? (displayMediaSrc(rawStoryMedia) ?? rawStoryMedia) : undefined;
  const hasStoryMedia = Boolean(rawStoryMedia && !isGradientStoryMedia(rawStoryMedia));
  const storyIsVideo = Boolean(hasStoryMedia && isVideoMediaUrl(rawStoryMedia));
  const storyIsImage = Boolean(hasStoryMedia && isImageMediaUrl(rawStoryMedia));
  const storyAccessibleLabel =
    item?.mediaAlt?.trim() ||
    parseStoryCaption(item?.caption).text.trim() ||
    (storyIsImage ? "Story image" : storyIsVideo ? "Story video" : "");
  const grad = rawStoryMedia?.startsWith("linear-gradient") ? rawStoryMedia : (STORY_GRADS[idx % STORY_GRADS.length] ?? "");
  const captionDisplay = parseStoryCaption(item?.caption);
  const initials = group?.author.displayName.slice(0, 2).toUpperCase() ?? "??";
  const totalItems = group?.stories.length ?? 1;
  const [mediaStatus, setMediaStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<StoryViewerEntry[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [viewersError, setViewersError] = useState<string | null>(null);
  const [firstViewer, setFirstViewer] = useState<StoryViewerEntry | null>(null);
  const [previewViewers, setPreviewViewers] = useState<StoryViewerEntry[]>([]);
  const [deletePending, setDeletePending] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySent, setReplySent] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [leavePending, setLeavePending] = useState(false);
  const [paused, setPaused] = useState(false);
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false);
  const [storyReaction, setStoryReaction] = useState<string | null>(item?.myReaction ?? null);
  const [storyReactionCount, setStoryReactionCount] = useState(item?.reactionCount ?? 0);
  const [storyReactionPending, setStoryReactionPending] = useState(false);
  const isOwner = Boolean(viewerId && group?.authorId === viewerId);
  const isStoryAuthor = Boolean(viewerId && item?.author?.id === viewerId);
  const isCollaborator = Boolean(
    viewerId && item?.collaborators?.some((c) => c.userId === viewerId),
  );
  const canReply = Boolean(group && !isOwner && !isStoryAuthor && group.author.allowStoryReplies !== false);
  const hasPrevStory = itemIdx > 0 || idx > 0;
  const hasNextStory = itemIdx < totalItems - 1 || idx < groups.length - 1;
  const previousStoryPreview = adjacentStoryPreview(groups, idx, itemIdx, "prev");
  const nextStoryPreview = adjacentStoryPreview(groups, idx, itemIdx, "next");
  const visiblePreviousStoryPreview = previousStoryPreview?.group.authorId === viewerId ? null : previousStoryPreview;
  const visibleNextStoryPreview = nextStoryPreview?.group.authorId === viewerId ? null : nextStoryPreview;

  const goNext = useCallback(() => {
    if (itemIdx < totalItems - 1) { setProgress(0); setItemIdx(i => i + 1); return; }
    if (idx < groups.length - 1) { setProgress(0); setItemIdx(0); setIdx(i => i + 1); }
    else { onClose(); }
  }, [idx, itemIdx, totalItems, groups.length, onClose]);

  const goPrev = useCallback(() => {
    if (itemIdx > 0) { setProgress(0); setItemIdx(i => i - 1); return; }
    setIdx(i => {
      if (i <= 0) return i;
      const previousGroup = groups[i - 1];
      setProgress(0);
      setItemIdx(Math.max(0, (previousGroup?.stories.length ?? 1) - 1));
      return i - 1;
    });
  }, [groups, itemIdx]);

  useEffect(() => {
    setProgress(0);
    setPaused(false);
    setViewersOpen(false);
    setViewers([]);
    setViewersError(null);
    setFirstViewer(null);
    setPreviewViewers([]);
    setOwnerMenuOpen(false);
    setStoryReaction(item?.myReaction ?? null);
    setStoryReactionCount(item?.reactionCount ?? 0);
    setStoryReactionPending(false);
    setMediaStatus(hasStoryMedia ? "loading" : "ready");
  }, [idx, itemIdx, hasStoryMedia, item?.myReaction, item?.reactionCount]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (paused) return;
    intervalRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) return 100;
        return Math.min(100, p + (100 / (STORY_DURATION / 100)));
      });
    }, 100);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [paused]);

  useEffect(() => {
    if (progress < 100 || paused) return;
    goNext();
  }, [progress, paused, goNext]);

  useEffect(() => {
    if (!isOwner || !item?.id) return;
    const viewCount = item?.viewCount ?? 0;
    if (viewCount <= 0) {
      setFirstViewer(null);
      setPreviewViewers([]);
      return;
    }

    let alive = true;
    Promise.all([
      fetch(`/api/stories/${item.id}/viewers?limit=1&order=asc`).then((res) => res.ok ? res.json() : null).catch(() => null),
      fetch(`/api/stories/${item.id}/viewers?limit=3&order=desc`).then((res) => res.ok ? res.json() : null).catch(() => null),
    ])
      .then(([first, preview]) => {
        if (!alive) return;
        const entry = (first?.viewers?.[0] ?? null) as StoryViewerEntry | null;
        setFirstViewer(entry);
        setPreviewViewers((preview?.viewers ?? []) as StoryViewerEntry[]);
      })
      .catch(() => {
        if (!alive) return;
        setFirstViewer(null);
        setPreviewViewers([]);
      });

    return () => {
      alive = false;
    };
  }, [isOwner, item?.id, item?.viewCount]);

  useEffect(() => {
    if (item?.id) {
      fetch(`/api/stories/${item.id}/view`, { method: "POST" })
        .then((res) => {
          if (res.ok && group?.authorId) {
            onViewed?.(item.id, group.authorId);
            emitStoryViewed({ storyId: item.id, authorId: group.authorId });
          }
        })
        .catch(() => {});
    }
  }, [group?.authorId, item?.id, onViewed]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, goNext, goPrev]);

  async function leaveCollab() {
    if (!item || !viewerId || leavePending) return;
    setLeavePending(true);
    try {
      const res = await fetch(
        `/api/stories/${encodeURIComponent(item.id)}/collaborators/${encodeURIComponent(viewerId)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        onDeleted?.(item.id, item.author?.id ?? group?.authorId ?? "");
        onClose();
      }
    } catch {
      /* swallow */
    } finally {
      setLeavePending(false);
    }
  }

  async function sendReply() {
    if (!group) return;
    const text = replyText.trim();
    if (!text || replySending || !canReply) return;
    setReplySending(true);
    setReplyError(null);
    try {
      const cvRes = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: group.authorId, storyReply: true }),
      });
      const cvData = await cvRes.json().catch(() => null);
      if (!cvRes.ok) throw new Error(cvData?.error ?? "Could not send reply.");
      const conversationId = cvData?.conversationId as string | undefined;
      if (!conversationId) throw new Error("Could not send reply.");
      const msgRes = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, text }),
      });
      const msgData = await msgRes.json().catch(() => null);
      if (!msgRes.ok) throw new Error(msgData?.error ?? "Could not send reply.");
      setReplyText("");
      setReplySent(true);
      setTimeout(() => setReplySent(false), 2000);
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : "Could not send reply.");
    } finally {
      setReplySending(false);
    }
  }

  async function toggleStoryHeart() {
    if (!item?.id || isOwner || isStoryAuthor || storyReactionPending) return;

    const previousReaction = storyReaction;
    const previousCount = storyReactionCount;
    const removingHeart = storyReaction === STORY_HEART_REACTION;
    const nextReaction = removingHeart ? null : STORY_HEART_REACTION;
    setStoryReactionPending(true);
    setStoryReaction(nextReaction);
    setStoryReactionCount((count) => Math.max(0, count + (nextReaction && !previousReaction ? 1 : !nextReaction && previousReaction ? -1 : 0)));

    try {
      const res = await fetch(`/api/stories/${encodeURIComponent(item.id)}/reactions`, {
        method: removingHeart ? "DELETE" : "POST",
        headers: removingHeart ? undefined : { "Content-Type": "application/json" },
        body: removingHeart ? undefined : JSON.stringify({ emoji: STORY_HEART_REACTION }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not update reaction.");
      setStoryReaction(removingHeart ? null : (data?.emoji ?? STORY_HEART_REACTION));
      if (typeof data?.count === "number") setStoryReactionCount(data.count);
    } catch {
      setStoryReaction(previousReaction);
      setStoryReactionCount(previousCount);
    } finally {
      setStoryReactionPending(false);
    }
  }

  async function loadViewers() {
    if (!item?.id || !isOwner) return;
    setViewersOpen(true);
    setViewersLoading(true);
    setViewersError(null);

    try {
      const res = await fetch(`/api/stories/${item.id}/viewers`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not load viewers.");
      setViewers(data?.viewers ?? []);
    } catch (err) {
      setViewersError((err as Error).message);
    } finally {
      setViewersLoading(false);
    }
  }

  async function deleteStory() {
    if (!item?.id || !group?.authorId || !isOwner || deletePending) return;
    if (!(await confirm("Delete this story?"))) return;

    setDeletePending(true);
    try {
      const res = await fetch(`/api/stories/${item.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not delete story.");
      onDeleted?.(item.id, group.authorId);
      onClose();
    } catch (err) {
      setViewersError((err as Error).message);
      setViewersOpen(true);
    } finally {
      setDeletePending(false);
    }
  }

  if (!group) return null;

  return (
    <div className="sv-overlay sv-overlay--ig" onClick={onClose}>

      <button className="sv-global-close" onClick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="22" height="22">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      <div className="sv-stage sv-stage--ig">
        {visiblePreviousStoryPreview && (
          <SideStoryPreview
            preview={visiblePreviousStoryPreview}
            side="prev"
            onOpen={goPrev}
          />
        )}
        {hasPrevStory && (
          <button
            type="button"
            className="sv-story-nav sv-story-nav--prev"
            onClick={(event) => {
              event.stopPropagation();
              goPrev();
            }}
            aria-label="Previous story"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        <div className="sv-card sv-card--ig" onClick={e => e.stopPropagation()}>
          <div className="sv-progress-row">
            {group.stories.map((s, i) => (
              <div key={s.id} className="sv-progress-track">
                <div className="sv-progress-fill" style={{ width: i < itemIdx ? "100%" : i === itemIdx ? `${progress}%` : "0%" }} />
              </div>
            ))}
          </div>

          <div className="sv-header sv-header--ig">
            <StoryHeaderAuthors
              ringOwner={group.author}
              storyAuthor={item?.author}
              collaborators={item?.collaborators ?? []}
              ownerInitials={initials}
              ringGrad={grad}
            />
            <div className="sv-meta">
              <span className="sv-name">{storyAuthorshipLabel(group.author, item?.author, item?.collaborators)}</span>
              <span className="sv-time">{new Date(item?.createdAt ?? "").toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="sv-header-actions">
              {item?.audience === "CLOSE_CIRCLE" && (
                <span className="sv-story-badge sv-story-badge--close">Close Circle</span>
              )}
              {item?.containsAdultContent ? <NsfwChip /> : null}
              <button
                className="sv-ig-icon-btn"
                type="button"
                onClick={() => setPaused((value) => !value)}
                aria-label={paused ? "Resume story" : "Pause story"}
                aria-pressed={paused}
              >
                {paused ? (
                  <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">
                    <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                  </svg>
                )}
              </button>
              <div className="sv-more-wrap">
                <button
                  className="sv-ig-icon-btn"
                  type="button"
                  onClick={() => setOwnerMenuOpen((value) => !value)}
                  aria-label="More story options"
                  aria-expanded={ownerMenuOpen}
                >
                <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17" aria-hidden="true">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
                </button>
                {ownerMenuOpen && (
                  <div className="sv-more-menu" role="menu">
                    {isOwner ? (
                      <button
                        type="button"
                        role="menuitem"
                        className="sv-more-menu-item sv-more-menu-item--danger"
                        onClick={() => {
                          setOwnerMenuOpen(false);
                          void deleteStory();
                        }}
                        disabled={deletePending}
                      >
                        {deletePending ? "Deleting..." : "Delete story"}
                      </button>
                    ) : (
                      <span className="sv-more-menu-note">No options</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            {!isOwner && isCollaborator && (
              <button
                type="button"
                onClick={leaveCollab}
                disabled={leavePending}
                aria-label="Leave collaboration"
                style={{
                  padding: "5px 10px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  border: "none",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: leavePending ? "wait" : "pointer",
                }}
              >
                {leavePending ? "Leaving…" : "Leave collab"}
              </button>
            )}
          </div>

          <div className="sv-body sv-body--ig" style={{ background: grad }}>
            {storyIsVideo && (
              <StoryVideo
                key={item?.id}
                src={storyMediaSrc}
                playbackMode={(item?.playbackMode as "NORMAL" | "LOOP" | "BOOMERANG" | undefined) ?? "NORMAL"}
                onReady={() => setMediaStatus("ready")}
                onError={() => setMediaStatus("error")}
                ariaLabel={storyAccessibleLabel || undefined}
              />
            )}
            {storyIsImage && storyMediaSrc && (
              <Image
                key={item?.id}
                className="sv-media"
                src={storyMediaSrc}
                alt={storyAccessibleLabel}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 480px"
                unoptimized={shouldUnoptimizeNextImageSrc(storyMediaSrc)}
                onLoad={() => setMediaStatus("ready")}
                onError={() => setMediaStatus("error")}
              />
            )}
            {!hasStoryMedia && <span className="sv-body-initials">{initials}</span>}
            {hasStoryMedia && mediaStatus === "loading" && <div className="sv-media-state">Loading media...</div>}
            {hasStoryMedia && mediaStatus === "error" && <div className="sv-media-state sv-media-state--error">Could not load media</div>}
            {captionDisplay.drawStrokes.length > 0 && (
              <svg className="sv-draw-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {captionDisplay.drawStrokes.map((stroke) => (
                  <polyline
                    key={stroke.id}
                    points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke={stroke.color}
                    strokeWidth={stroke.width / 10}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            )}
            {captionDisplay.stickers.map((sticker) => (
              <span
                key={sticker.id}
                className={`sv-caption${sticker.background ? "" : " sv-caption--plain"}`}
                style={{
                  left: `${sticker.x}%`,
                  top: `${sticker.y}%`,
                  width: sticker.background ? `${sticker.width}%` : undefined,
                  transform: `translate(-50%, -50%) scale(${sticker.background ? 1 : sticker.scale})`,
                  zIndex: 6 + sticker.z,
                  color: sticker.color,
                }}
              >
                {sticker.text}
              </span>
            ))}
          </div>

          <button className="sv-tap sv-tap--left" onClick={e => { e.stopPropagation(); goPrev(); }} aria-label="Previous" />
          <button className="sv-tap sv-tap--right" onClick={e => { e.stopPropagation(); goNext(); }} aria-label="Next" />
        </div>
        {hasNextStory && (
          <button
            type="button"
            className="sv-story-nav sv-story-nav--next"
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
            aria-label="Next story"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )}
        {visibleNextStoryPreview && (
          <SideStoryPreview
            preview={visibleNextStoryPreview}
            side="next"
            onOpen={goNext}
          />
        )}
      </div>

      <div className="sv-bottom-bar sv-bottom-bar--ig" onClick={e => e.stopPropagation()}>
        {isOwner ? (
          <div className="sv-owner-actions sv-owner-actions--seen-only">
            <button
              className="sv-seen-mini"
              type="button"
              onClick={() => { if (viewersOpen) setViewersOpen(false); else loadViewers(); }}
              aria-label={`Seen by ${item?.viewCount ?? 0}`}
              aria-expanded={viewersOpen}
            >
              <span className="sv-seen-stack" aria-hidden="true">
                {(previewViewers.length ? previewViewers : firstViewer ? [firstViewer] : []).slice(0, 3).map((entry, i) => (
                  entry.user.avatarUrl
                    ? (() => {
                        const src = displayMediaSrc(entry.user.avatarUrl) ?? entry.user.avatarUrl!;
                        return (
                          <Image key={`${entry.user.id}-${entry.viewedAt}`} src={src} alt="" width={20} height={20} sizes="20px" className="sv-seen-stack-av sv-seen-stack-av--img" style={{ zIndex: 3 - i }} unoptimized={shouldUnoptimizeNextImageSrc(src)} />
                        );
                      })()
                    : <span key={`${entry.user.id}-${entry.viewedAt}`} className="sv-seen-stack-av" style={{ zIndex: 3 - i }}>{entry.user.displayName.slice(0, 1).toUpperCase()}</span>
                ))}
              </span>
              <span className="sv-seen-text">
                <span className="sv-seen-label">Seen by</span>
                <span className="sv-seen-count">{item?.viewCount ?? 0}</span>
              </span>
            </button>
          </div>
        ) : (
          <>
            <input
              className="sv-reply-input"
              placeholder={replySent ? "Sent!" : `Reply to ${group.author.username}…`}
              value={replyText}
              onChange={e => { setReplyText(e.target.value); setReplyError(null); }}
              onKeyDown={e => e.key === "Enter" && sendReply()}
              disabled={replySending || !canReply}
            />
            {!canReply && <span className="sv-reply-off">Replies off</span>}
            {replyError && <span className="sv-reply-error" role="alert">{replyError}</span>}
            <button
              className={`sv-action-btn${storyReaction === STORY_HEART_REACTION ? " sv-action-btn--liked" : ""}`}
              type="button"
              aria-label={storyReaction === STORY_HEART_REACTION ? "Unlike story" : "Like story"}
              aria-pressed={storyReaction === STORY_HEART_REACTION}
              onClick={toggleStoryHeart}
              disabled={storyReactionPending}
              title={storyReactionCount > 0 ? `${storyReactionCount} reaction${storyReactionCount === 1 ? "" : "s"}` : undefined}
            >
              <svg viewBox="0 0 24 24" fill={storyReaction === STORY_HEART_REACTION ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </button>
            <button className="sv-action-btn" aria-label="Send" onClick={sendReply} disabled={!replyText.trim() || replySending || !canReply}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
                <path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4 20-7Z"/>
              </svg>
            </button>
          </>
        )}
      </div>
      {viewersOpen && isOwner && (
        <div className="sv-viewers-panel" onClick={e => e.stopPropagation()}>
          <div className="sv-viewers-head">
            <div>
              <span className="sv-viewers-title">Seen by</span>
              <span className="sv-viewers-sub">{viewers.length} people</span>
            </div>
            <button className="sv-viewers-close" type="button" onClick={() => setViewersOpen(false)} aria-label="Close viewers">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" width="17" height="17">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="sv-viewers-list">
            {viewersLoading && <p className="sv-viewers-empty">Loading viewers...</p>}
            {!viewersLoading && viewersError && <p className="sv-viewers-empty sv-viewers-empty--error">{viewersError}</p>}
            {!viewersLoading && !viewersError && viewers.length === 0 && (
              <p className="sv-viewers-empty">No viewers yet.</p>
            )}
            {!viewersLoading && !viewersError && viewers.map(view => (
              <div key={`${view.user.id}-${view.viewedAt}`} className="sv-viewer-row">
                {view.user.avatarUrl ? (() => {
                  const src = displayMediaSrc(view.user.avatarUrl) ?? view.user.avatarUrl;
                  return <Image src={src} alt="" width={36} height={36} sizes="36px" className="sv-viewer-avatar sv-viewer-avatar--img" unoptimized={shouldUnoptimizeNextImageSrc(src)} />;
                })() : (
                  <span className="sv-viewer-avatar">{view.user.displayName.slice(0, 2).toUpperCase()}</span>
                )}
                <div className="sv-viewer-meta">
                  <span className="sv-viewer-name">{view.user.username}</span>
                  <span className="sv-viewer-time">{new Date(view.viewedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SideStoryPreview({ preview, side, onOpen }: {
  preview: StoryPreview;
  side: "prev" | "next";
  onOpen: () => void;
}) {
  const mediaUrl = getMediaUrl(preview.item.mediaUrl);
  const mediaSrc = mediaUrl ? (displayMediaSrc(mediaUrl) ?? mediaUrl) : undefined;
  const isImage = Boolean(mediaUrl && !isGradientStoryMedia(mediaUrl) && isImageMediaUrl(mediaUrl));
  const isVideo = Boolean(mediaUrl && !isGradientStoryMedia(mediaUrl) && isVideoMediaUrl(mediaUrl));
  const grad = mediaUrl?.startsWith("linear-gradient")
    ? mediaUrl
    : STORY_GRADS[preview.groupIdx % STORY_GRADS.length];
  const initials = preview.group.author.displayName.slice(0, 2).toUpperCase();
  const avatarSrc = preview.group.author.avatarUrl
    ? (displayMediaSrc(preview.group.author.avatarUrl) ?? preview.group.author.avatarUrl)
    : null;
  const createdAt = new Date(preview.item.createdAt).getTime();
  const ageHours = Number.isFinite(createdAt)
    ? Math.max(1, Math.floor((Date.now() - createdAt) / (60 * 60 * 1000)))
    : null;

  return (
    <button
      type="button"
      className={`sv-side-card sv-side-card--${side}`}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      aria-label={`${side === "prev" ? "Previous" : "Next"} story from ${preview.group.author.username}`}
    >
      <span className="sv-side-bg" style={{ background: grad }}>
        {isImage && mediaSrc ? (
          <Image className="sv-side-media" src={mediaSrc} alt="" width={120} height={180} sizes="120px" unoptimized={shouldUnoptimizeNextImageSrc(mediaSrc)} />
        ) : isVideo && mediaSrc ? (
          <video className="sv-side-media" src={mediaSrc} muted playsInline preload="metadata" aria-hidden="true" />
        ) : (
          <span className="sv-side-initials">{initials}</span>
        )}
        <span className="sv-side-info">
          <span className="sv-side-avatar" style={{ background: grad }}>
            {avatarSrc ? (
              <Image src={avatarSrc} alt="" width={20} height={20} sizes="20px" unoptimized={shouldUnoptimizeNextImageSrc(avatarSrc)} />
            ) : initials.slice(0, 1)}
          </span>
          <span className="sv-side-name">{preview.group.author.username}</span>
          {ageHours != null && <span className="sv-side-time">{ageHours}h</span>}
        </span>
      </span>
    </button>
  );
}

/**
 * Compact stack of avatars in the story header. Shows the ring owner first,
 * the original author second when different (collab story shown under a
 * collaborator's ring), and up to two collaborators after that.
 */
function StoryHeaderAuthors({
  ringOwner,
  storyAuthor,
  collaborators,
  ownerInitials,
  ringGrad,
}: {
  ringOwner: { id: string; username: string; displayName: string; avatarUrl: string | null };
  storyAuthor?: { id: string; username: string; displayName: string; avatarUrl: string | null };
  collaborators: Array<{ userId: string; username: string; displayName: string; avatarUrl: string | null }>;
  ownerInitials: string;
  ringGrad: string;
}) {
  const stack: Array<{ id: string; displayName: string; avatarUrl: string | null; isPrimary: boolean }> = [
    {
      id: ringOwner.id,
      displayName: ringOwner.displayName,
      avatarUrl: ringOwner.avatarUrl,
      isPrimary: true,
    },
  ];
  if (storyAuthor && storyAuthor.id !== ringOwner.id) {
    stack.push({
      id: storyAuthor.id,
      displayName: storyAuthor.displayName,
      avatarUrl: storyAuthor.avatarUrl,
      isPrimary: false,
    });
  }
  for (const collab of collaborators) {
    if (collab.userId === ringOwner.id) continue;
    if (storyAuthor && collab.userId === storyAuthor.id) continue;
    if (stack.length >= 3) break;
    stack.push({
      id: collab.userId,
      displayName: collab.displayName,
      avatarUrl: collab.avatarUrl,
      isPrimary: false,
    });
  }

  const only = stack[0];
  if (stack.length === 1 && only) {
    return only.avatarUrl ? (
      <Image className="sv-avatar" src={only.avatarUrl} alt="" width={40} height={40} sizes="40px" style={{ background: ringGrad }} unoptimized={shouldUnoptimizeNextImageSrc(only.avatarUrl)} />
    ) : (
      <div className="sv-avatar" style={{ background: ringGrad }}>{ownerInitials}</div>
    );
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center" }}>
      {stack.map((entry, idx) => {
        const initials = entry.displayName.slice(0, 2).toUpperCase();
        const baseStyle = {
          marginLeft: idx === 0 ? 0 : -8,
          width: entry.isPrimary ? 32 : 26,
          height: entry.isPrimary ? 32 : 26,
          borderRadius: "50%",
          border: "2px solid var(--app-card)",
          background: ringGrad,
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: entry.isPrimary ? 12 : 10,
          fontWeight: 700,
          overflow: "hidden",
          flexShrink: 0,
        } as const;
        return entry.avatarUrl ? (
          <Image key={entry.id} src={entry.avatarUrl} alt="" width={28} height={28} sizes="28px" style={baseStyle} unoptimized={shouldUnoptimizeNextImageSrc(entry.avatarUrl)} />
        ) : (
          <span key={entry.id} style={baseStyle}>{initials}</span>
        );
      })}
    </div>
  );
}

/**
 * Compose the header label depending on whether the viewer is looking at the
 * author's ring or a collaborator's ring.
 */
function storyAuthorshipLabel(
  ringOwner: { id: string; username: string },
  storyAuthor?: { id: string; username: string },
  collaborators?: Array<{ userId: string; username: string }>,
): string {
  const collabCount = (collaborators ?? []).filter(
    (c) => c.userId !== ringOwner.id && (!storyAuthor || c.userId !== storyAuthor.id),
  ).length;
  const sharedWith = collabCount > 0 ? ` +${collabCount}` : "";
  if (storyAuthor && storyAuthor.id !== ringOwner.id) {
    return `${storyAuthor.username} · w/ ${ringOwner.username}${sharedWith}`;
  }
  return collabCount > 0 ? `${ringOwner.username}${sharedWith}` : ringOwner.username;
}

/**
 * Video element honouring `playbackMode`:
 *   - NORMAL    → plays through once
 *   - LOOP      → native `loop` attribute
 *   - BOOMERANG → forward to end, then ping-pong reverse via rAF (browsers do
 *                  not support negative `playbackRate` consistently, so we step
 *                  `currentTime` backward manually).
 */
function StoryVideo({
  src,
  playbackMode,
  onReady,
  onError,
  ariaLabel,
}: {
  src: string | undefined;
  playbackMode: "NORMAL" | "LOOP" | "BOOMERANG";
  onReady: () => void;
  onError: () => void;
  /** Accessible name for the video (from story `mediaAlt` or caption). */
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (playbackMode !== "BOOMERANG") return;
    const video = ref.current;
    if (!video) return;

    let direction: 1 | -1 = 1;
    let raf: number | null = null;
    let lastTimestamp: number | null = null;

    const tick = (timestamp: number) => {
      const dt = lastTimestamp == null ? 0.016 : (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      if (direction === 1) {
        if (video.duration && video.currentTime >= video.duration - 0.05) {
          direction = -1;
          video.pause();
        }
      } else {
        const next = video.currentTime - dt;
        if (next <= 0.05) {
          video.currentTime = 0;
          direction = 1;
          void video.play().catch(() => undefined);
        } else {
          video.currentTime = next;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [playbackMode, src]);

  return (
    <video
      ref={ref}
      className="sv-media"
      src={src}
      autoPlay
      muted
      playsInline
      preload="auto"
      loop={playbackMode === "LOOP"}
      onLoadedData={onReady}
      onError={onError}
      aria-label={ariaLabel ?? "Story video"}
    />
  );
}
