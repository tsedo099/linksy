"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { displayMediaSrc, isVideoMediaUrl } from "@/lib/media";
import { useLanguagePreferences } from "@/components/language-provider";
import { storyEditorStrings } from "@/lib/i18n/story-editor-copy";
import {
  formatBytes,
  isAllowedStoryMediaType,
  STORY_ALLOWED_MEDIA_TYPES,
  STORY_MEDIA_MAX_SIZE,
} from "@/lib/story-limits";
import { uploadUserMedia } from "@/lib/create-media-upload";
import { normalizePollOptions, pollValidationMessage, validatePollForSubmit } from "@/lib/create-poll";
import { CreateAudiencePicker } from "@/components/create/audience-picker";
import { AdultContentToggle } from "@/components/adult-content-toggle";
import { CreatePollEditor } from "@/components/create/poll-editor";
import { StoryMediaCanvasPreview } from "@/components/create/media-uploader";
import { useCurrentUserStore } from "@/lib/stores/current-user";
import {
  BG_GRADS,
  type CollaboratorOption,
  clampNumber,
  encodeStoryCaption,
  estimateStickerWidth,
  newDrawStrokeId,
  newStickerId,
  normalizeStoryTextColor,
  STORY_CAPTION_MAX_LENGTH,
  STORY_COLLABORATORS_MAX,
  STORY_DRAW_MAX_POINTS,
  STORY_DRAW_MAX_STROKES,
  STORY_EMOJIS,
  STORY_STICKER_DRAG_THRESHOLD,
  STORY_STICKERS_MAX,
  STORY_TEXT_COLOR_DEFAULT,
  STORY_TEXT_COLORS,
  type StoryDrawStroke,
  type StoryTextSticker,
} from "./modal-types";
import { IcBack, IcDraw, IcImage, IcMusic, IcSmile, IcText } from "./modal-icons";

const STORY_ACCEPTED_MEDIA = STORY_ALLOWED_MEDIA_TYPES.join(",");
const STORY_MEDIA_LIMIT_LABEL = formatBytes(STORY_MEDIA_MAX_SIZE);

export function StoryEditor({ onClose, onBack }: { onClose: () => void; onBack: () => void }) {
  const { language } = useLanguagePreferences();
  const se = useMemo(() => storyEditorStrings(language), [language]);
  const [bg, setBg]           = useState(BG_GRADS[0]);
  const [stickers, setStickers] = useState<StoryTextSticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [editingStickerId, setEditingStickerId] = useState<string | null>(null);
  const [audience, setAudience] = useState<"PUBLIC" | "FOLLOWERS" | "CLOSE_CIRCLE">("PUBLIC");
  const [sending, setSending] = useState(false);
  const [done, setDone]       = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaLoadState, setMediaLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [status, setStatus] = useState<{ message: string; ok: boolean } | null>(null);
  const [withPoll, setWithPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollDurationHours, setPollDurationHours] = useState(24);
  const [playbackMode, setPlaybackMode] = useState<"NORMAL" | "LOOP" | "BOOMERANG">("NORMAL");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState<CollaboratorOption[]>([]);
  const [mentionSearchPending, setMentionSearchPending] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [drawColor, setDrawColor] = useState<string>(STORY_TEXT_COLOR_DEFAULT);
  const [drawStrokes, setDrawStrokes] = useState<StoryDrawStroke[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorOption[]>([]);
  const [containsAdultContent, setContainsAdultContent] = useState(false);
  const [collabQuery, setCollabQuery] = useState("");
  const [collabResults, setCollabResults] = useState<CollaboratorOption[]>([]);
  const [collabSearchPending, setCollabSearchPending] = useState(false);
  const [mediaAlt, setMediaAlt] = useState("");
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stickerRefs = useRef(new Map<string, HTMLDivElement>());
  const dragOffsetRef = useRef({ id: "", pointerId: -1, x: 0, y: 0, startClientX: 0, startClientY: 0, dragging: false });
  const resizeStartRef = useRef({ id: "", clientX: 0, width: 48, scale: 1 });
  const activeDrawStrokeRef = useRef<string | null>(null);
  const mediaIsVideo = Boolean(mediaFile?.type.startsWith("video/") || isVideoMediaUrl(mediaPreview));
  const currentUserId = useCurrentUserStore((state) => state.user?.id ?? null);
  const storyCaptionText = stickers.map((sticker) => sticker.text.trim()).filter(Boolean).join("\n");
  const hasStoryVisualContent = Boolean(storyCaptionText.trim() || drawStrokes.length > 0);
  const mentionedUserIds = Array.from(new Set(stickers.flatMap((sticker) => sticker.mentionUserId ? [sticker.mentionUserId] : [])));
  const mentionedUserIdSet = new Set(mentionedUserIds);
  const selectableMentionResults = mentionResults.filter((user) => user.id !== currentUserId && !mentionedUserIdSet.has(user.id));
  const collaboratorIdSet = new Set(collaborators.map((user) => user.id));
  const selectableCollabResults = collabResults.filter((user) => user.id !== currentUserId && !collaboratorIdSet.has(user.id));
  const selectedSticker = stickers.find((sticker) => sticker.id === selectedStickerId) ?? null;

  useEffect(() => {
    const trimmed = collabQuery.trim();
    if (!trimmed) {
      setCollabResults([]);
      setCollabSearchPending(false);
      return;
    }
    setCollabSearchPending(true);
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setCollabResults([]);
          return;
        }
        const data = (await res.json().catch(() => null)) as
          | { users?: Array<{ id: string; username: string; displayName: string; avatarUrl: string | null }> }
          | null;
        const users = (data?.users ?? []).slice(0, 8).map((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
        }));
        setCollabResults(users);
      } catch {
        /* aborted or network error */
      } finally {
        setCollabSearchPending(false);
      }
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [collabQuery]);

  useEffect(() => {
    const trimmed = mentionQuery.trim().replace(/^@/, "");
    if (!mentionOpen || !trimmed) {
      setMentionResults([]);
      setMentionSearchPending(false);
      return;
    }
    setMentionSearchPending(true);
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setMentionResults([]);
          return;
        }
        const data = (await res.json().catch(() => null)) as
          | { users?: Array<{ id: string; username: string; displayName: string; avatarUrl: string | null }> }
          | null;
        const users = (data?.users ?? []).slice(0, 8).map((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatarUrl: u.avatarUrl,
        })).filter((u) => u.id !== currentUserId);
        setMentionResults(users);
      } catch {
        /* aborted or network error */
      } finally {
        setMentionSearchPending(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [currentUserId, mentionOpen, mentionQuery]);

  useEffect(() => {
    return () => {
      if (mediaPreview?.startsWith("blob:")) URL.revokeObjectURL(mediaPreview);
    };
  }, [mediaPreview]);

  function chooseMedia(file: File | null | undefined) {
    if (!file) return;

    if (!isAllowedStoryMediaType(file.type)) {
      setStatus({ message: se.errMediaType, ok: false });
      return;
    }

    if (file.size <= 0) {
      setStatus({ message: se.errEmptyFile, ok: false });
      return;
    }

    if (file.size > STORY_MEDIA_MAX_SIZE) {
      setStatus({ message: se.errFileTooLargeFmt(STORY_MEDIA_LIMIT_LABEL), ok: false });
      return;
    }

    if (mediaPreview?.startsWith("blob:")) URL.revokeObjectURL(mediaPreview);
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    setMediaAlt("");
    setMediaLoadState("loading");
    setStatus(null);
  }

  function removeMedia() {
    if (mediaPreview?.startsWith("blob:")) URL.revokeObjectURL(mediaPreview);
    setMediaFile(null);
    setMediaPreview(null);
    setMediaAlt("");
    setMediaLoadState("idle");
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  }

  function nextStickerZ(items = stickers) {
    return items.reduce((max, sticker) => Math.max(max, sticker.z), 0) + 1;
  }

  function bringStickerToFront(id: string) {
    setStickers((current) => {
      const target = current.find((sticker) => sticker.id === id);
      if (!target) return current;
      const nextZ = nextStickerZ(current);
      if (target.z === nextZ - 1) return current;
      return current.map((sticker) => sticker.id === id ? { ...sticker, z: nextZ } : sticker);
    });
  }

  function addSticker(initialText = "", options?: { mentionUserId?: string; background?: boolean; width?: number }) {
    if (stickers.length >= STORY_STICKERS_MAX) {
      setStatus({ message: se.errMaxStickersFmt(STORY_STICKERS_MAX), ok: false });
      return;
    }
    const id = newStickerId();
    const offset = Math.min(18, stickers.length * 5);
    const sticker: StoryTextSticker = {
      id,
      text: initialText,
      x: Math.min(76, 50 + offset),
      y: Math.min(76, 50 + offset),
      width: options?.width ?? estimateStickerWidth(initialText, Boolean(options?.mentionUserId)),
      scale: 1,
      background: options?.background ?? false,
      z: nextStickerZ(),
      color: STORY_TEXT_COLORS[0],
      mentionUserId: options?.mentionUserId,
    };
    setStickers((current) => [...current, sticker]);
    setSelectedStickerId(id);
    setEditingStickerId(id);
    window.setTimeout(() => stickerRefs.current.get(id)?.focus(), 0);
  }

  function addEmoji(emoji: string) {
    addSticker(emoji);
    setEmojiOpen(false);
  }

  function addMention(user: CollaboratorOption) {
    if (user.id === currentUserId || mentionedUserIdSet.has(user.id)) {
      setMentionOpen(false);
      setMentionQuery("");
      setMentionResults([]);
      return;
    }
    addSticker(`@${user.username}`, {
      mentionUserId: user.id,
      background: true,
      width: estimateStickerWidth(`@${user.username}`, true),
    });
    setMentionOpen(false);
    setMentionQuery("");
    setMentionResults([]);
  }

  function closeMentionTool() {
    setMentionOpen(false);
    setMentionQuery("");
    setMentionResults([]);
    setMentionSearchPending(false);
  }

  function addCollaborator(user: CollaboratorOption) {
    if (user.id === currentUserId) {
      setStatus({ message: se.errSelfCollaborator, ok: false });
      return;
    }
    if (collaboratorIdSet.has(user.id)) {
      setStatus({ message: se.errAlreadyCollaboratorFmt(user.username), ok: false });
      return;
    }
    if (collaborators.length >= STORY_COLLABORATORS_MAX) {
      setStatus({ message: se.errMaxCollaboratorsFmt(STORY_COLLABORATORS_MAX), ok: false });
      return;
    }
    setCollaborators((prev) => [...prev, user]);
    setCollabQuery("");
    setCollabResults([]);
    setStatus({ message: se.okCollaboratorInvitedFmt(user.username), ok: true });
  }

  function updateStickerText(id: string, element: HTMLElement) {
    const next = element.innerText.slice(0, STORY_CAPTION_MAX_LENGTH);
    if (element.innerText !== next) {
      element.innerText = next;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    setStickers((current) => current.map((sticker) => (
      sticker.id === id ? { ...sticker, text: next } : sticker
    )));
  }

  function pasteStickerText(id: string, event: ReactClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain").slice(0, STORY_CAPTION_MAX_LENGTH);
    document.execCommand("insertText", false, text);
    updateStickerText(id, event.currentTarget);
  }

  function deleteSticker(id: string) {
    setStickers((current) => current.filter((sticker) => sticker.id !== id));
    setSelectedStickerId((current) => current === id ? null : current);
    setEditingStickerId((current) => current === id ? null : current);
  }

  function cleanupEmptySticker(id: string) {
    setStickers((current) => {
      const target = current.find((sticker) => sticker.id === id);
      if (!target || target.text.trim()) return current;
      return current.filter((sticker) => sticker.id !== id);
    });
    setSelectedStickerId((current) => current === id ? null : current);
    setEditingStickerId((current) => current === id ? null : current);
  }

  function startCaptionDrag(event: ReactPointerEvent<HTMLDivElement>, sticker: StoryTextSticker) {
    const canvas = canvasRef.current;
    if (!canvas || event.button !== 0) return;
    setSelectedStickerId(sticker.id);
    setEditingStickerId(sticker.id);
    bringStickerToFront(sticker.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    dragOffsetRef.current = {
      id: sticker.id,
      pointerId: event.pointerId,
      x: event.clientX - (rect.left + (sticker.x / 100) * rect.width),
      y: event.clientY - (rect.top + (sticker.y / 100) * rect.height),
      startClientX: event.clientX,
      startClientY: event.clientY,
      dragging: false,
    };
  }

  function dragCaption(event: ReactPointerEvent<HTMLDivElement>) {
    if (!(event.buttons & 1)) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const offset = dragOffsetRef.current;
    if (!offset.id || offset.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - offset.startClientX, event.clientY - offset.startClientY);
    if (!offset.dragging && moved < STORY_STICKER_DRAG_THRESHOLD) return;
    if (!offset.dragging) {
      offset.dragging = true;
      if (event.currentTarget.contains(document.activeElement)) {
        (document.activeElement as HTMLElement | null)?.blur();
      }
    }
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const stickerRect = event.currentTarget.getBoundingClientRect();
    const halfWidth = clampNumber((stickerRect.width / rect.width) * 50, 6, 42);
    const halfHeight = clampNumber((stickerRect.height / rect.height) * 50, 4, 42);
    const nextX = ((event.clientX - offset.x - rect.left) / rect.width) * 100;
    const nextY = ((event.clientY - offset.y - rect.top) / rect.height) * 100;
    setStickers((current) => current.map((sticker) => (
      sticker.id === offset.id
        ? {
            ...sticker,
            x: clampNumber(nextX, halfWidth + 1, 99 - halfWidth),
            y: clampNumber(nextY, halfHeight + 1, 99 - halfHeight),
          }
        : sticker
    )));
  }

  function startCaptionResize(event: ReactPointerEvent<HTMLButtonElement>, sticker: StoryTextSticker) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedStickerId(sticker.id);
    setEditingStickerId(sticker.id);
    bringStickerToFront(sticker.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStartRef.current = { id: sticker.id, clientX: event.clientX, width: sticker.width, scale: sticker.scale };
  }

  function resizeCaption(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!(event.buttons & 1)) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const start = resizeStartRef.current;
    const deltaPercent = ((event.clientX - resizeStartRef.current.clientX) / canvas.getBoundingClientRect().width) * 100;
    setStickers((current) => current.map((sticker) => {
      if (sticker.id !== start.id) return sticker;
      return sticker.background
        ? { ...sticker, width: clampNumber(start.width + deltaPercent, 14, 72) }
        : { ...sticker, scale: Math.min(2.4, Math.max(0.55, start.scale + (deltaPercent / 42))) };
    }));
  }

  function toggleStickerBackground(id: string) {
    setStickers((current) => current.map((sticker) => (
      sticker.id === id
        ? {
            ...sticker,
            background: !sticker.background,
            width: !sticker.background
              ? estimateStickerWidth(sticker.text, Boolean(sticker.mentionUserId))
              : sticker.width,
          }
        : sticker
    )));
    setSelectedStickerId(id);
    setEditingStickerId(id);
    bringStickerToFront(id);
  }

  function setStickerColor(id: string, color: string) {
    const normalized = normalizeStoryTextColor(color);
    setStickers((current) => current.map((sticker) => (
      sticker.id === id ? { ...sticker, color: normalized } : sticker
    )));
    setSelectedStickerId(id);
    setEditingStickerId(id);
    bringStickerToFront(id);
  }

  function canvasPoint(event: ReactPointerEvent<HTMLDivElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: clampNumber(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clampNumber(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  function startDraw(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drawMode || event.button !== 0) return;
    const point = canvasPoint(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedStickerId(null);
    setEditingStickerId(null);
    const id = newDrawStrokeId();
    activeDrawStrokeRef.current = id;
    setDrawStrokes((current) => {
      if (current.length >= STORY_DRAW_MAX_STROKES) {
        setStatus({ message: se.errMaxStrokesFmt(STORY_DRAW_MAX_STROKES), ok: false });
        return current;
      }
      return [...current, { id, color: drawColor, width: 4, points: [point] }];
    });
  }

  function moveDraw(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drawMode || !(event.buttons & 1) || !activeDrawStrokeRef.current) return;
    const point = canvasPoint(event);
    if (!point) return;
    event.preventDefault();
    const strokeId = activeDrawStrokeRef.current;
    setDrawStrokes((current) => current.map((stroke) => {
      if (stroke.id !== strokeId || stroke.points.length >= STORY_DRAW_MAX_POINTS) return stroke;
      const previous = stroke.points[stroke.points.length - 1];
      if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 0.35) return stroke;
      return { ...stroke, points: [...stroke.points, point] };
    }));
  }

  function finishDraw() {
    activeDrawStrokeRef.current = null;
  }

  function exitDrawMode() {
    finishDraw();
    setDrawMode(false);
  }

  function openMentionTool() {
    exitDrawMode();
    setEmojiOpen(false);
    setSelectedStickerId(null);
    setEditingStickerId(null);
    setMentionOpen((value) => {
      if (value) {
        setMentionQuery("");
        setMentionResults([]);
      }
      return !value;
    });
  }

  function shouldKeepDrawModeTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest(".se-draw-layer, .se-draw-style-bar, [data-story-tool='draw']"));
  }

  function finishStickerInteraction(id: string) {
    const finishedDrag = dragOffsetRef.current.id === id && dragOffsetRef.current.dragging;
    dragOffsetRef.current = { id: "", pointerId: -1, x: 0, y: 0, startClientX: 0, startClientY: 0, dragging: false };
    window.setTimeout(() => {
      const node = stickerRefs.current.get(id);
      if (node && node.contains(document.activeElement)) return;
      if (finishedDrag) {
        setEditingStickerId((current) => current === id ? null : current);
        return;
      }
      setEditingStickerId((current) => current === id ? null : current);
      cleanupEmptySticker(id);
    }, 0);
  }

  async function share() {
    if (sending || done) return;
    const trimmedCaption = storyCaptionText.trim();
    if (!mediaFile && !hasStoryVisualContent) {
      setStatus({ message: se.errAddMedia, ok: false });
      return;
    }
    if (trimmedCaption.length > STORY_CAPTION_MAX_LENGTH) {
      setStatus({ message: se.errCaptionTooLongFmt(STORY_CAPTION_MAX_LENGTH), ok: false });
      return;
    }
    const normalizedPollQuestion = pollQuestion.trim();
    const normalizedPollOptions = normalizePollOptions(pollOptions);
    const pollCode = validatePollForSubmit(withPoll, pollQuestion, pollOptions);
    if (pollCode) {
      setStatus({ message: pollValidationMessage(pollCode, "story"), ok: false });
      return;
    }

    setSending(true);
    setStatus(null);
    try {
      let mediaUrl = bg;
      if (mediaFile) {
        mediaUrl = await uploadUserMedia(mediaFile, "story");
      }

      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl,
          mediaAlt: mediaFile ? (mediaAlt.trim() || trimmedCaption || se.defaultMediaAlt).slice(0, 2000) : undefined,
          caption: hasStoryVisualContent
            ? encodeStoryCaption(stickers.filter((sticker) => sticker.text.trim()), drawStrokes)
            : undefined,
          audience,
          poll: withPoll
            ? {
                question: normalizedPollQuestion,
                options: normalizedPollOptions,
                durationHours: pollDurationHours,
              }
            : undefined,
          playbackMode: mediaIsVideo && playbackMode !== "NORMAL" ? playbackMode : undefined,
          mentionedUserIds: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
          collaboratorIds: collaborators.length > 0 ? collaborators.map((u) => u.id) : undefined,
          containsAdultContent,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? se.errCouldNotShare);
      }
      setDone(true);
      setTimeout(onClose, 1100);
    } catch (err) {
      setStatus({ message: (err as Error).message, ok: false });
    } finally {
      setSending(false);
    }
  }

  const swatches = (
    <div className="se-bgs">
      {BG_GRADS.map((g, i) => (
        <button
          key={i}
          className={`se-bg-swatch${bg === g ? " se-bg-swatch--on" : ""}`}
          style={{ background: g }}
          onClick={() => setBg(g)}
          aria-label={se.backgroundSwatchFmt(i + 1)}
        />
      ))}
    </div>
  );

  const shareBtn = (
    <button
      className={`se-share-btn${done ? " se-share-btn--done" : ""}`}
      onClick={share}
      disabled={sending || done || (!mediaFile && !hasStoryVisualContent)}
    >
      {done ? se.shared : sending ? (mediaFile ? se.uploading : se.sharing) : se.shareStory}
    </button>
  );

  const mediaControls = (
    <div className="se-media-controls">
      <button type="button" className="se-media-btn" onClick={() => mediaInputRef.current?.click()}>
        {mediaFile ? se.changeMedia : se.addPhotoVideoFull}
      </button>
      {mediaFile && (
        <button type="button" className="se-media-btn se-media-btn--ghost" onClick={removeMedia}>
          {se.remove}
        </button>
      )}
    </div>
  );

  return (
    <div
      className="se-root"
      onPointerDownCapture={(event) => {
        if (drawMode && !shouldKeepDrawModeTarget(event.target)) exitDrawMode();
        if (mentionOpen && event.target instanceof Element && !event.target.closest(".se-mention-wrap")) {
          closeMentionTool();
        }
      }}
    >
      <input
        ref={mediaInputRef}
        className="se-file-input"
        type="file"
        accept={STORY_ACCEPTED_MEDIA}
        onChange={e => chooseMedia(e.target.files?.[0])}
      />
      {/* ── Canvas column (always visible, has the gradient bg) ── */}
      <div className="se-canvas-col" style={{ background: bg }}>
        <div className="se-prog-bar"><div className="se-prog-fill" /></div>

        <div className="se-top-bar">
          <button className="se-icon-btn" onClick={onBack} aria-label={se.back}><IcBack /></button>
          <div className="se-tools-row">
            <button
              className={`se-icon-btn${mediaFile ? " se-icon-btn--on" : ""}`}
              onClick={() => {
                exitDrawMode();
                mediaInputRef.current?.click();
              }}
              title={se.addPhotoVideo}
            >
              <IcImage />
            </button>
            <button
              className="se-icon-btn"
              onClick={() => {
                addSticker();
                setEmojiOpen(false);
                setMentionOpen(false);
                exitDrawMode();
              }}
              title={se.addText}
            >
              <IcText />
            </button>
            <div className="se-mention-wrap">
              <button
                type="button"
                className={`se-icon-btn se-mention-btn${mentionOpen ? " se-icon-btn--on" : ""}`}
                title={se.mentionAria}
                aria-label={se.mentionAria}
                aria-expanded={mentionOpen}
                onClick={openMentionTool}
              >
                @
              </button>
              {mentionOpen && (
                <div className="se-mention-picker" role="dialog" aria-label={se.mentionUsername}>
                  <div className="se-mention-head">
                    <span>{se.mention}</span>
                    <button type="button" onClick={closeMentionTool} aria-label={se.closeMentionPicker}>{se.mentionDone}</button>
                  </div>
                  <input
                    className="se-mention-input"
                    value={mentionQuery}
                    onChange={(event) => setMentionQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        closeMentionTool();
                      }
                      if (event.key === "Enter" && selectableMentionResults[0]) {
                        event.preventDefault();
                        addMention(selectableMentionResults[0]);
                      }
                    }}
                    placeholder={se.mentionPlaceholder}
                    autoFocus
                  />
                  <div className="se-mention-results">
                    {!mentionQuery.trim() ? <span className="se-mention-empty">{se.mentionSearchHint}</span> : null}
                    {mentionSearchPending ? <span className="se-mention-empty">{se.mentionSearching}</span> : null}
                    {!mentionSearchPending && mentionQuery.trim() && mentionResults.length === 0 ? (
                      <span className="se-mention-empty">{se.mentionNoUsers}</span>
                    ) : null}
                    {!mentionSearchPending && mentionQuery.trim() && mentionResults.length > 0 && selectableMentionResults.length === 0 ? (
                      <span className="se-mention-empty">{se.mentionAlreadyAdded}</span>
                    ) : null}
                    {mentionResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className="se-mention-option"
                        disabled={mentionedUserIdSet.has(user.id)}
                        onClick={() => addMention(user)}
                      >
                        <span className="se-mention-avatar">
                          {user.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={user.avatarUrl} alt="" />
                          ) : (
                            user.displayName.slice(0, 1).toUpperCase()
                          )}
                        </span>
                        <span>
                          <strong>{user.displayName}</strong>
                          <small>@{user.username}{mentionedUserIdSet.has(user.id) ? se.mentionAddedSuffix : ""}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              data-story-tool="draw"
              className={`se-icon-btn${drawMode ? " se-icon-btn--on" : ""}`}
              title={se.draw}
              aria-label={se.draw}
              aria-pressed={drawMode}
              onClick={() => {
                if (drawMode) finishDraw();
                setDrawMode((value) => !value);
                setEmojiOpen(false);
                setMentionOpen(false);
                setSelectedStickerId(null);
                setEditingStickerId(null);
              }}
            >
              <IcDraw />
            </button>
            <div className="se-emoji-wrap">
              <button
                type="button"
                className={`se-icon-btn${emojiOpen ? " se-icon-btn--on" : ""}`}
                title={se.addEmoji}
                aria-label={se.addEmoji}
                aria-expanded={emojiOpen}
                onClick={() => {
                  setEmojiOpen((value) => !value);
                  setMentionOpen(false);
                  exitDrawMode();
                }}
              >
                <IcSmile />
              </button>
              {emojiOpen && (
                <div className="se-emoji-picker" role="menu" aria-label={se.storyEmojiPicker}>
                  {STORY_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="se-emoji-option"
                      role="menuitem"
                      onClick={() => addEmoji(emoji)}
                      aria-label={se.addEmojiFmt(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="se-icon-btn se-icon-btn--disabled" title={se.musicComingSoon} disabled aria-disabled="true"><IcMusic /></button>
          </div>
        </div>

        {selectedSticker && (
          <div className="se-sticker-style-bar" role="toolbar" aria-label={se.selectedStickerStyle}>
            <span className="se-style-label">{se.styleLabel}</span>
            <button
              type="button"
              className={`se-style-bg-toggle${selectedSticker.background ? " se-style-bg-toggle--on" : ""}`}
              aria-label={se.toggleStickerBg}
              aria-pressed={selectedSticker.background}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => toggleStickerBackground(selectedSticker.id)}
            >
              {se.bgLabel}
            </button>
            <div className="se-text-color-row" aria-label={se.textColor}>
              {STORY_TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`se-text-color-btn${selectedSticker.color === color ? " se-text-color-btn--on" : ""}`}
                  style={{ background: color }}
                  aria-label={se.setTextColorFmt(color)}
                  aria-pressed={selectedSticker.color === color}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setStickerColor(selectedSticker.id, color)}
                />
              ))}
            </div>
          </div>
        )}

        {drawMode && (
          <div className="se-sticker-style-bar se-draw-style-bar" role="toolbar" aria-label={se.drawTools}>
            <span className="se-style-label">{se.draw}</span>
            <div className="se-text-color-row" aria-label={se.drawColor}>
              {STORY_TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`se-text-color-btn${drawColor === color ? " se-text-color-btn--on" : ""}`}
                  style={{ background: color }}
                  aria-label={se.setDrawColorFmt(color)}
                  aria-pressed={drawColor === color}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setDrawColor(color)}
                />
              ))}
            </div>
            <div className="se-draw-actions">
              <button
                type="button"
                className="se-style-bg-toggle"
                disabled={drawStrokes.length === 0}
                onClick={() => setDrawStrokes((current) => current.slice(0, -1))}
              >
                {se.undo}
              </button>
              <button
                type="button"
                className="se-style-bg-toggle se-style-bg-toggle--on"
                onClick={() => {
                  finishDraw();
                  setDrawMode(false);
                }}
              >
                {se.done}
              </button>
            </div>
          </div>
        )}

        <div className="se-canvas" ref={canvasRef}>
          <StoryMediaCanvasPreview
            mediaPreview={mediaPreview}
            mediaFile={mediaFile}
            mediaAlt={mediaAlt}
            mediaLoadState={mediaLoadState}
            onVideoLoaded={() => setMediaLoadState("ready")}
            onVideoError={() => setMediaLoadState("error")}
            onImageLoad={() => setMediaLoadState("ready")}
            onImageError={() => setMediaLoadState("error")}
          />
          <div
            className={`se-draw-layer${drawMode ? " se-draw-layer--active" : ""}`}
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={finishDraw}
            onPointerCancel={finishDraw}
          >
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {drawStrokes.map((stroke) => (
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
          </div>
          {stickers.map((sticker) => (
            <div
              key={sticker.id}
              className={`se-text-sticker${sticker.background ? "" : " se-text-sticker--plain"}${editingStickerId === sticker.id ? " se-text-sticker--editing" : ""}`}
              style={{
                left: `${sticker.x}%`,
                top: `${sticker.y}%`,
                width: sticker.background ? `${sticker.width}%` : undefined,
                transform: `translate(-50%, -50%) scale(${sticker.background ? 1 : sticker.scale})`,
                zIndex: 6 + sticker.z,
                color: sticker.color,
              }}
              onPointerDown={(event) => startCaptionDrag(event, sticker)}
              onPointerMove={dragCaption}
              onPointerUp={() => finishStickerInteraction(sticker.id)}
              onPointerCancel={() => finishStickerInteraction(sticker.id)}
              onFocusCapture={() => {
                setSelectedStickerId(sticker.id);
                setEditingStickerId(sticker.id);
                bringStickerToFront(sticker.id);
              }}
              onBlurCapture={(event) => {
                const nextFocus = event.relatedTarget;
                if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) return;
                if (dragOffsetRef.current.id === sticker.id && dragOffsetRef.current.dragging) return;
                setEditingStickerId((current) => current === sticker.id ? null : current);
                cleanupEmptySticker(sticker.id);
              }}
            >
              <div
                ref={(node) => {
                  if (node) stickerRefs.current.set(sticker.id, node);
                  else stickerRefs.current.delete(sticker.id);
                }}
                className={`se-text-input${sticker.background ? "" : " se-text-input--plain"}${sticker.mentionUserId ? " se-text-input--mention" : ""}`}
                style={{ color: sticker.color }}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-label={sticker.mentionUserId ? se.storyMention : se.storyText}
                data-placeholder={se.writeSomething}
                onInput={(event) => {
                  updateStickerText(sticker.id, event.currentTarget);
                }}
                onPaste={(event) => {
                  pasteStickerText(sticker.id, event);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") event.currentTarget.blur();
                  if ((event.key === "Backspace" || event.key === "Delete") && !event.currentTarget.innerText.trim()) {
                    event.preventDefault();
                    deleteSticker(sticker.id);
                  }
                }}
                onPointerDown={() => {
                  setSelectedStickerId(sticker.id);
                }}
              >
                {sticker.text}
              </div>
              <button
                type="button"
                className="se-sticker-delete-btn"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={() => deleteSticker(sticker.id)}
                aria-label={se.deleteSticker}
                title={se.deleteTitle}
              >
                ×
              </button>
              <button
                type="button"
                className="se-sticker-resize-handle"
                onPointerDown={(event) => startCaptionResize(event, sticker)}
                onPointerMove={resizeCaption}
                aria-label={se.resizeText}
                title={se.resizeTitle}
              />
            </div>
          ))}
        </div>

        {/* Mobile-only bottom overlay */}
        <div className="se-bottom">
          {mediaControls}
          {mediaFile ? (
            <div style={{ padding: "0 12px", width: "100%" }}>
              <label htmlFor="se-story-alt-m" style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--app-text-muted)" }}>
                {se.describeMediaA11y}
              </label>
              <textarea
                id="se-story-alt-m"
                className="se-text-input"
                rows={2}
                maxLength={2000}
                value={mediaAlt}
                onChange={(e) => setMediaAlt(e.target.value)}
                placeholder={se.describeMediaPh}
                style={{ width: "100%", minHeight: 56 }}
              />
            </div>
          ) : null}
          {swatches}
          <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
            <AdultContentToggle
              checked={containsAdultContent}
              onChange={setContainsAdultContent}
            />
          </div>
          <div className="se-share-row">
            <CreateAudiencePicker variant="story" layout="row" value={audience} onChange={setAudience} />
            {shareBtn}
          </div>
          {status && <p className={`se-status${status.ok ? " se-status--ok" : ""}`}>{status.message}</p>}
        </div>
      </div>

      {/* ── Desktop-only sidebar ── */}
      <aside className="se-sidebar">
        <p className="se-sidebar-label">{se.mediaLabel}</p>
        {mediaControls}
        {mediaFile ? (
          <>
            <p className="se-sidebar-label">{se.accessibilityLabel}</p>
            <textarea
              className="se-poll-input"
              rows={2}
              maxLength={2000}
              value={mediaAlt}
              onChange={(e) => setMediaAlt(e.target.value)}
              placeholder={se.describeSidebar}
              aria-label={se.altAria}
            />
          </>
        ) : null}

        <p className="se-sidebar-label">{se.backgroundLabel}</p>
        {swatches}

        <p className="se-sidebar-label">{se.audienceLabel}</p>
        <CreateAudiencePicker variant="story" layout="column" value={audience} onChange={setAudience} />

        <p className="se-sidebar-label">{se.pollLabel}</p>
        <CreatePollEditor
          variant="story"
          withPoll={withPoll}
          onTogglePoll={() => setWithPoll((value) => !value)}
          pollQuestion={pollQuestion}
          onPollQuestionChange={setPollQuestion}
          pollOptions={pollOptions}
          onPollOptionsChange={setPollOptions}
          pollDurationHours={pollDurationHours}
          onPollDurationHoursChange={setPollDurationHours}
        />

        {mediaIsVideo ? (
          <>
            <p className="se-sidebar-label">{se.playbackLabel}</p>
            <div className="se-aud-row" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["NORMAL", "LOOP", "BOOMERANG"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`se-aud-btn${playbackMode === mode ? " se-aud-btn--on" : ""}`}
                  onClick={() => setPlaybackMode(mode)}
                  style={{ flex: "1 1 0", minWidth: 0 }}
                >
                  <span className="se-aud-label">
                    {mode === "NORMAL" ? se.playbackNormal : mode === "LOOP" ? se.playbackLoop : se.playbackBoomerang}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}

        <section className="se-collab-card" aria-labelledby="se-collab-title">
          <div className="se-collab-head">
            <div>
              <p className="se-sidebar-label" id="se-collab-title">{se.coAuthorsLabel}</p>
            </div>
            <span className="se-collab-count">{collaborators.length}/{STORY_COLLABORATORS_MAX}</span>
          </div>

          {collaborators.length > 0 ? (
            <div className="se-collab-selected" aria-label={se.selectedCoAuthors}>
              {collaborators.map((user) => (
                <span key={user.id} className="se-collab-chip">
                  <span className="se-collab-avatar">
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={displayMediaSrc(user.avatarUrl) ?? user.avatarUrl} alt="" />
                    ) : (
                      user.displayName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="se-collab-chip-copy">
                    <strong>{user.displayName}</strong>
                    <small>@{user.username}</small>
                  </span>
                  <button
                    type="button"
                    className="se-collab-remove"
                    onClick={() => setCollaborators((prev) => prev.filter((entry) => entry.id !== user.id))}
                    aria-label={se.removeUserFmt(user.username)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="se-collab-empty">{se.noCoAuthors}</p>
          )}

          {collaborators.length < STORY_COLLABORATORS_MAX ? (
            <div className="se-collab-search">
              <input
                type="text"
                className="se-poll-input se-collab-input"
                placeholder={se.searchInvitePh}
                value={collabQuery}
                onChange={(event) => setCollabQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setCollabQuery("");
                    setCollabResults([]);
                  }
                  if (event.key === "Enter" && selectableCollabResults[0]) {
                    event.preventDefault();
                    addCollaborator(selectableCollabResults[0]);
                  }
                }}
                aria-describedby="se-collab-help"
              />
              <span className="se-collab-help" id="se-collab-help">{se.enterToAddHint}</span>
              {collabQuery.trim() ? (
                <div className="se-collab-results" role="listbox" aria-label={se.coAuthorResultsAria}>
                  {collabSearchPending ? (
                    <span className="se-collab-state">{se.searchingDots}</span>
                  ) : collabResults.length === 0 ? (
                    <span className="se-collab-state">{se.noPeopleFound}</span>
                  ) : selectableCollabResults.length === 0 ? (
                    <span className="se-collab-state">{se.alreadyAddedOrUnavailable}</span>
                  ) : (
                    selectableCollabResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className="se-collab-option"
                        onClick={() => addCollaborator(user)}
                      >
                        <span className="se-collab-avatar">
                          {user.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={displayMediaSrc(user.avatarUrl) ?? user.avatarUrl} alt="" />
                          ) : (
                            user.displayName.slice(0, 1).toUpperCase()
                          )}
                        </span>
                        <span className="se-collab-option-copy">
                          <strong>{user.displayName}</strong>
                          <small>@{user.username}</small>
                        </span>
                        <span className="se-collab-option-action">{se.invite}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="se-collab-limit">{se.maxCoAuthorsReached}</p>
          )}
        </section>

        <div className="se-sidebar-spacer" />
        {status && <p className={`se-status${status.ok ? " se-status--ok" : ""}`}>{status.message}</p>}
        {shareBtn}
      </aside>
    </div>
  );
}
