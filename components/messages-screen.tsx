"use client";

import { useLanguagePreferences } from "@/components/language-provider";
import { messagesScreenLastSeen, messagesScreenStrings } from "@/lib/i18n/messages-screen-copy";
import { displayMediaSrc, getMediaUrl, isAudioMediaUrl, isImageMediaUrl, isVideoMediaUrl } from "@/lib/media";
import { SkeletonConvoItem, SkeletonMessage } from "@/components/skeleton";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMessagesUnreadStore } from "@/lib/stores/messages-unread";
import { useCurrentUserStore } from "@/lib/stores/current-user";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { userProfileHref } from "@/lib/user-url";
import { Mail, MoreHorizontal, Pin, Trash2, VolumeX } from "lucide-react";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import { CallSurface } from "@/components/call/call-surface";
import { AdultContentToggle } from "@/components/adult-content-toggle";
import { Av } from "@/components/messages/avatar";
import { Bubble } from "@/components/messages/bubble";
import { ConvoItem } from "@/components/messages/convo-item";
import { Empty } from "@/components/messages/empty";
import { ComposeModal } from "@/components/messages/compose-modal";
import { AddPeopleDialog } from "@/components/messages/add-people-dialog";
import {
  IcAttach,
  IcBack,
  IcCompose,
  IcEmoji,
  IcInfo,
  IcMic,
  IcPhone,
  IcPin,
  IcSearch,
  IcSend,
  IcStop,
  IcTrash,
  IcUsers,
  IcVideo,
  IcX,
} from "@/components/messages/icons";
import {
  type ApiConvo,
  type ApiMember,
  type ApiMessage,
  type ApiMessageReaction,
  type ApiUser,
  CONVERSATION_THEME_OPTIONS,
  type ConversationTheme,
  type LocalConversationPrefs,
  apiErrorMessage,
  clockOf,
  colorFor,
  downsamplePeaks,
  formatDuration,
  loadConversationPrefs,
} from "@/components/messages/types";

// CONVERSATION_THEME_OPTIONS, ConversationTheme re-exported here for legacy import paths.
export { CONVERSATION_THEME_OPTIONS };
export type { ConversationTheme };

/* â”€â”€ Main â”€â”€ */
export function MessagesScreen() {
  const { language, locale } = useLanguagePreferences();
  const ms = useMemo(() => messagesScreenStrings(language), [language]);
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlConversationId = searchParams.get("conversation");
  const urlTargetUserId = searchParams.get("userId");
  // Pull from the shared current-user store so MessagesScreen always has
  // a viewer id available immediately on mount — even before the local
  // /api/auth/me fetch resolves. Without this fallback, hitting Send in
  // the first ~500ms after the screen mounts silently early-returns
  // because the local `myId` is still the initial empty string.
  const storedUser = useCurrentUserStore((s) => s.user);
  const [myIdLocal, setMyId] = useState(storedUser?.id ?? "");
  const myId = myIdLocal || storedUser?.id || "";
  const [me, setMe] = useState<ApiUser | null>(
    storedUser
      ? {
          id: storedUser.id ?? "",
          username: storedUser.username ?? "",
          displayName: storedUser.displayName ?? "You",
          avatarUrl: storedUser.avatarUrl ?? null,
        }
      : null,
  );
  const [convos, setConvos]         = useState<ApiConvo[]>([]);
  const [requests, setRequests]     = useState<ApiConvo[]>([]);
  const [loadingC, setLoadingC]     = useState(true);
  const [activeId, setActiveId]     = useState<string | null>(null);
  const [msgs, setMsgs]             = useState<ApiMessage[]>([]);
  const [hiddenIds, setHiddenIds]   = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = window.localStorage.getItem("linksy:msg-hidden");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [loadingM, setLoadingM]     = useState(false);
  const [input, setInput]           = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [composeAdult, setComposeAdult] = useState(false);
  const [sending, setSending]       = useState(false);
  // Mutex ref that mirrors `sending` but isn't subject to React Fast
  // Refresh state preservation. If a previous render somehow leaked
  // sending=true (HMR mid-POST, unhandled throw before finally), the
  // ref-based check still lets the next send through.
  const sendingRef = useRef(false);
  // Hard reset both on mount: HMR can preserve `sending=true` from a
  // previous edit where the POST never completed, leaving the composer
  // permanently disabled until full refresh. This guarantees clean state.
  useEffect(() => {
    sendingRef.current = false;
    setSending(false);
  }, []);
  const [search, setSearch]         = useState("");
  const [sideTab, setSideTab]       = useState<"direct" | "group" | "requests">("direct");
  const [compose, setCompose]       = useState(false);
  const [notice, setNotice]         = useState<string | null>(null);
  const [mobileSide, setMobileSide] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [prefs, setPrefs]           = useState<LocalConversationPrefs>({});
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupNameBusy, setGroupNameBusy] = useState(false);
  const [memberMenuOpen, setMemberMenuOpen] = useState<string | null>(null);
  const [addPeopleOpen, setAddPeopleOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<null | "block" | "delete">(null);
  const [convoContext, setConvoContext] = useState<{ id: string; x: number; y: number } | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [moreMenuFor, setMoreMenuFor] = useState<string | null>(null);
  const [pinnedMessageId, setPinnedMessageId] = useState<string | null>(null);
  const [isChatBlocked, setIsChatBlocked] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ApiMessage | null>(null);
  const [didInitialMessagesLoad, setDidInitialMessagesLoad] = useState(false);
  const [peerPresence, setPeerPresence] = useState<{ online: boolean; lastSeenAt: string | null } | null>(null);
  // Outgoing call mode — flipped by the phone/video buttons in the header,
  // cleared by CallSurface's onClosed.
  const [callMode, setCallMode] = useState<
    | { kind: "outgoing"; conversationId: string; callKind: "AUDIO" | "VIDEO" }
    | null
  >(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const feedRef   = useRef<HTMLDivElement>(null);
  const taRef     = useRef<HTMLTextAreaElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);
  const visibleMsgs = useMemo(() => msgs.filter((m) => !hiddenIds.has(m.id)), [msgs, hiddenIds]);
  useEffect(() => {
    return () => {
      if (attachmentPreview?.startsWith("blob:")) URL.revokeObjectURL(attachmentPreview);
    };
  }, [attachmentPreview]);

  const autoStartKeyRef = useRef<string | null>(null);
  /** Cleared only when `?conversation=` value actually changes (avoids Strict Mode / HMR double-pick). */
  const prevUrlConversationIdRef = useRef<string | null>(null);
  const lastPickedForUrlConversationRef = useRef<string | null>(null);

  type TypingPeer = { id: string; username: string; displayName: string; avatarUrl: string | null; expiresAt: number };
  const [typingPeers, setTypingPeers] = useState<TypingPeer[]>([]);

  type RecorderState = "idle" | "recording" | "preview" | "uploading";
  const [recState, setRecState] = useState<RecorderState>("idle");
  const [recDurationMs, setRecDurationMs] = useState(0);
  const [recPeaks, setRecPeaks] = useState<number[]>([]);
  const [recPreviewUrl, setRecPreviewUrl] = useState<string | null>(null);
  const recBlobRef = useRef<Blob | null>(null);
  const recMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recAudioContextRef = useRef<AudioContext | null>(null);
  const recAnalyserFrameRef = useRef<number | null>(null);
  const recStreamRef = useRef<MediaStream | null>(null);
  const recStartedAtRef = useRef<number>(0);
  const recTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  type SearchResult = { id: string; text: string; snippet: string; createdAt: string; sender: ApiUser };
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const typingSweepRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendTypingRef = useRef<{ lastSent: number; lastValue: boolean | null; idleTimer: ReturnType<typeof setTimeout> | null }>({
    lastSent: 0,
    lastValue: null,
    idleTimer: null,
  });

  const showError = useCallback((message: string) => {
    setNotice(message);
  }, []);

  // Success toast — same notice slot as errors, auto-dismisses after 3s so
  // the user gets a clear confirmation that an action (leave / add member /
  // remove member) actually went through.
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSuccess = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 3000);
  }, []);

  // Mirror late updates from the shared store into local `me` (avatar /
  // display-name swap, post-login hydration). myId is already derived
  // inline via `myIdLocal || storedUser?.id` so no extra wiring needed
  // for the send-guard, but `me` is used for cosmetic display.
  useEffect(() => {
    if (storedUser?.id) {
      setMe((current) => (current?.id === storedUser.id
        ? current
        : {
            id: storedUser.id ?? "",
            username: storedUser.username ?? "",
            displayName: storedUser.displayName ?? "You",
            avatarUrl: storedUser.avatarUrl ?? null,
          }));
    }
  }, [storedUser]);

  useEffect(() => {
    fetch("/api/auth/me").then(async r => {
      if (!r.ok) throw new Error(await apiErrorMessage(r, "Could not load your account."));
      return r.json();
    }).then(d => {
      if (d?.user?.id) {
        setMyId(d.user.id);
        setMe({
          id: d.user.id,
          username: d.user.username ?? "",
          displayName: d.user.displayName ?? "You",
          avatarUrl: d.user.avatarUrl ?? null,
        });
      }
    }).catch(error => {
      showError(error instanceof Error ? error.message : "Could not load your account.");
    });
  }, [showError]);

  useEffect(() => {
    setPrefs(loadConversationPrefs());
  }, []);

  useEffect(() => {
    if (!activeId) {
      setNicknameDraft("");
      setGroupNameDraft("");
      setMemberMenuOpen(null);
      setAddPeopleOpen(false);
      return;
    }
    setNicknameDraft(prefs[activeId]?.nickname ?? "");
    setMemberMenuOpen(null);
    setAddPeopleOpen(false);
    const active = convos.find((c) => c.id === activeId);
    setGroupNameDraft(active?.name ?? "");
  }, [activeId, prefs, convos]);

  const loadConvos = useCallback(async () => {
    try {
      const r = await fetch("/api/conversations").catch(() => null);
      if (!r?.ok) throw new Error(await apiErrorMessage(r, "Could not load conversations."));
      const d = await r.json();
      setConvos(d.conversations ?? []);
      setRequests(d.requests ?? []);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not load conversations.");
    } finally {
      setLoadingC(false);
    }
  }, [showError]);

  useEffect(() => { loadConvos(); }, [loadConvos]);

  // Inbox refresh strategy:
  //   • `linksy:conversations-activity` — instant push from AppShell SSE
  //     (single shared EventSource, no extra connections).
  //   • 3s polling backup so the list never falls out of sync if the SSE
  //     event missed us (e.g. AppShell unmounted mid-event).
  //   • Refresh on focus / visibility wake.
  // AppShell holds the only `/api/conversations/stream` EventSource — we
  // deliberately do NOT open a second one because Chrome/Firefox cap
  // HTTP/1.1 to 6 connections per origin and duplicate SSEs starve out the
  // POST /api/messages request (it gets queued behind the streams and
  // never reaches the server).
  useEffect(() => {
    const onActivity = () => { void loadConvos(); };
    window.addEventListener("linksy:conversations-activity", onActivity);
    // Backup poll lives behind SSE + the activity event — keep it long
     // so we don't pound /api/conversations every 3s for nothing.
    const backupId = window.setInterval(() => { void loadConvos(); }, 8000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadConvos();
    };
    const onFocus = () => void loadConvos();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("linksy:conversations-activity", onActivity);
      window.clearInterval(backupId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadConvos]);

  useEffect(() => {
    const prev = prevUrlConversationIdRef.current;
    if (prev !== urlConversationId) {
      lastPickedForUrlConversationRef.current = null;
    }
    prevUrlConversationIdRef.current = urlConversationId;
  }, [urlConversationId]);

  useEffect(() => {
    if (!myId || loadingC || !urlConversationId) return;
    const exists = [...convos, ...requests].some((item) => item.id === urlConversationId);
    if (!exists) return;
    // Avoid re-calling pick on every inbox refresh (SSE / poll): pick clears the feed and retriggers load animations.
    if (lastPickedForUrlConversationRef.current === urlConversationId) return;
    lastPickedForUrlConversationRef.current = urlConversationId;
    pick(urlConversationId);
  }, [convos, loadingC, myId, requests, urlConversationId]);

  useEffect(() => {
    if (!myId || loadingC) return;
    if (urlConversationId) return;
    if (!urlTargetUserId || urlTargetUserId === myId) return;

    const key = `${myId}:${urlTargetUserId}`;
    if (autoStartKeyRef.current === key) return;
    autoStartKeyRef.current = key;

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId: urlTargetUserId }),
        });
        const data = (await response.json().catch(() => null)) as { conversationId?: string; error?: string } | null;
        if (!response.ok || !data?.conversationId) {
          throw new Error(data?.error ?? "Could not open conversation.");
        }
        if (cancelled) return;
        await loadConvos();
        pick(data.conversationId);
        router.replace(`/messages?conversation=${encodeURIComponent(data.conversationId)}`);
      } catch (error) {
        if (!cancelled) {
          showError(error instanceof Error ? error.message : "Could not open conversation.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadingC, myId, urlConversationId, urlTargetUserId, loadConvos, router, showError]);

  // /messages-Ñ€ÑƒÑƒ Ð¾Ñ€Ð¾Ñ…Ð´Ð¾Ð¾ Ò®Ð Ð“Ð­Ð›Ð– conversation list Ð´ÑÑÑ€ Ð±ÑƒÑƒÐ´Ð°Ð³.
  // (Ð¥ÑƒÑƒÑ‡Ð¸Ð½ viewed conversation-Ñ€ÑƒÑƒ auto-open Ñ…Ð¸Ð¹Ñ…Ð¸Ð¹Ð³ Ð°Ñ€Ð¸Ð»Ð³Ð°ÑÐ°Ð½ â€” Ó©Ó©Ñ€ Ñ…Ò¯Ð½Ð¸Ð¹
  // group chat-Ñ€ÑƒÑƒ Ð³ÑÐ½ÑÑ‚ Ð¾Ñ€Ð¾Ñ… Ð³ÑÑ… Ð¼ÑÑ‚ Ð°ÑÑƒÑƒÐ´Ð°Ð» Ð³Ð°Ñ€Ð³Ð°Ð´Ð°Ð³ Ð±Ð°Ð¹ÑÐ°Ð½.)
  // ?conversation= / ?userId= query param-Ð°Ð°Ñ€ Ð» Ð·Ð°Ð°ÑÐ°Ð½ Ò¯ÐµÐ´ conversation
  // Ð½ÑÑÐ³Ð´ÑÐ½Ñ; deep-link Ð½ÑŒ Ñ‡Ð¸Ð³Ð½ÑÐ³Ñ‚ÑÐ¹ Ð°Ð¶Ð¸Ð»Ð»Ð°Ð´Ð°Ð³.

  const markActiveRead = useMessagesUnreadStore((s) => s.markActiveRead);

  const loadMsgs = useCallback(async (id: string) => {
    setLoadingM(true);
    setReactionPickerFor(null);
    setMoreMenuFor(null);
    // Optimistic: the moment the viewer opens a chat the badge should
    // drop, regardless of when the server-side read marker propagates
    // back over SSE.
    markActiveRead();
    try {
      const r = await fetch(`/api/conversations/${id}`).catch(() => null);
      if (!r?.ok) throw new Error(await apiErrorMessage(r, "Could not load messages."));
      const d = await r.json();
      const incoming = (d.messages ?? []) as ApiMessage[];
      const feedEl = feedRef.current;
      const isNearBottom = feedEl
        ? feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight < 120
        : true;

      let shouldScroll = false;
      setMsgs((prev) => {
        const changed =
          prev.length !== incoming.length
          || prev.some((m, index) => {
            const next = incoming[index];
            if (!next) return true;
            return (
              m.id !== next.id
              || m.text !== next.text
              || (m.mediaUrl ?? null) !== (next.mediaUrl ?? null)
              || (m.reactions?.length ?? 0) !== (next.reactions?.length ?? 0)
            );
          });
        if (!changed) return prev;

        const prevLast = prev[prev.length - 1];
        const nextLast = incoming[incoming.length - 1];
        const hasNewTailMessage = Boolean(nextLast && (!prevLast || prevLast.id !== nextLast.id));
        shouldScroll = !didInitialMessagesLoad || (isNearBottom && hasNewTailMessage);
        return incoming;
      });
      setConvos(p => p.map(c => c.id === id ? { ...c, unread: 0 } : c));
      if (Object.prototype.hasOwnProperty.call(d, "pinnedMessageId")) {
        setPinnedMessageId(d.pinnedMessageId ?? null);
      }
      if (Object.prototype.hasOwnProperty.call(d, "isBlockedByMe")) {
        setIsChatBlocked(Boolean(d.isBlockedByMe));
      }
      if (!didInitialMessagesLoad) {
        setDidInitialMessagesLoad(true);
      }
      if (shouldScroll) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "instant" }), 40);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not load messages.");
    } finally {
      setLoadingM(false);
    }
  }, [didInitialMessagesLoad, showError, markActiveRead]);

  const loadMsgsRef = useRef(loadMsgs);
  const activeIdRef = useRef<string | null>(activeId);
  useEffect(() => {
    loadMsgsRef.current = loadMsgs;
  }, [loadMsgs]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Initial load when entering a chat. The 1s active-chat polling effect
  // below + the AppShell SSE bridge keep messages fresh after this — no
  // separate "slow backup" interval needed.
  useEffect(() => {
    if (!activeId) return;
    loadMsgs(activeId);
  }, [activeId, loadMsgs]);

  // Typing indicator via polling (NOT SSE). The chat tab already holds
  // ~5 long-lived connections (AppShell notifications + conversations
  // SSE, presence, the inbox poller, the active-chat poller); adding a
  // typing SSE pushed us past Chrome's HTTP/1.1 6-per-origin cap and
  // queued POST /api/messages indefinitely. GET /typing returns the
  // current DB-backed snapshot — cheap (single indexed query) and
  // race-safe across restarts.
  useEffect(() => {
    if (!activeId || !myId) {
      setTypingPeers([]);
      return;
    }
    let cancelled = false;
    // Capture the chat id for this effect run. If the user switches chats
    // mid-flight the in-flight fetch can still resolve — we then need to
    // drop the response so we don't paint stale typers into the new chat.
    const effectChatId = activeId;

    async function pullTyping() {
      try {
        const res = await fetch(`/api/conversations/${effectChatId}/typing`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as {
          typingUsers?: Array<{ id: string; username: string; displayName: string; avatarUrl: string | null; expiresAt: string }>;
        } | null;
        if (cancelled || activeIdRef.current !== effectChatId) return;
        const next: TypingPeer[] = (data?.typingUsers ?? [])
          .filter((u) => u.id !== myId)
          .map((u) => ({
            id: u.id,
            username: u.username,
            displayName: u.displayName,
            avatarUrl: u.avatarUrl,
            expiresAt: new Date(u.expiresAt).getTime(),
          }));
        setTypingPeers((prev) => {
          if (prev.length === next.length && prev.every((p, i) => {
            const n = next[i];
            return n != null && p.id === n.id && p.expiresAt === n.expiresAt;
          })) {
            return prev;
          }
          return next;
        });
      } catch {
        /* network blip — try again on next tick */
      }
    }

    void pullTyping();
    // 3.5s felt slow ("typing real-time bish") — Neon pooler + Redis can
    // handle the load now that the connection bug is fixed.
    const id = window.setInterval(pullTyping, 1500);

    // Local sweep so the dots disappear smoothly between polls if a
    // peer's TTL lapses (the next GET would prune them anyway, but
    // this keeps the UI honest in the gap).
    if (typingSweepRef.current) clearInterval(typingSweepRef.current);
    typingSweepRef.current = setInterval(() => {
      const now = Date.now();
      setTypingPeers((prev) => {
        const live = prev.filter((p) => p.expiresAt > now);
        return live.length === prev.length ? prev : live;
      });
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (typingSweepRef.current) {
        clearInterval(typingSweepRef.current);
        typingSweepRef.current = null;
      }
      setTypingPeers([]);
    };
  }, [activeId, myId]);

  const msgActivityFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeId || !myId) return;

    function scheduleReload() {
      if (msgActivityFlushRef.current) clearTimeout(msgActivityFlushRef.current);
      msgActivityFlushRef.current = setTimeout(() => {
        msgActivityFlushRef.current = null;
        const id = activeIdRef.current;
        if (id) void loadMsgsRef.current(id);
      }, 140);
    }

    // Active-chat realtime — three layers:
    //   • `linksy:conversations-activity` window event — instant push from
    //     AppShell's shared SSE (latency: <100ms after server fan-out). We
    //     filter the detail.conversationId to only react when the activity
    //     is for THIS chat.
    //   • 1s polling — covers any event we missed (HMR reconnect gap,
    //     AppShell not yet mounted, payload missing).
    //   • Focus/visibility — covers backgrounded tabs whose timers were
    //     throttled by the browser.
    // We deliberately do NOT open a dedicated SSE here. Chrome/Firefox cap
    // HTTP/1.1 to 6 connections per origin; AppShell (2 SSE) + incoming
    // call listener (1 SSE) + presence (1 SSE) already burns 4 of them,
    // and a 5th would push the POST /api/messages send into a wait queue.
    const onActivity = (event: Event) => {
      const detail = (event as CustomEvent<{ conversationId?: string } | null>).detail;
      const targetId = detail?.conversationId;
      // No detail → server didn't include it; refresh anyway to be safe.
      if (!targetId || targetId === activeIdRef.current) scheduleReload();
    };
    window.addEventListener("linksy:conversations-activity", onActivity);
    // SSE + the activity event are primary; this is a safety net only.
    // 1s polling was hammering /api/messages and contributing to P2037s
    // on production; 6s felt laggy (skeleton flicker between events).
    // 3s is the middle ground — Neon pool handles the load fine.
    const refreshOnInterval = window.setInterval(scheduleReload, 3000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleReload();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", scheduleReload);

    return () => {
      window.removeEventListener("linksy:conversations-activity", onActivity);
      window.clearInterval(refreshOnInterval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", scheduleReload);
      if (msgActivityFlushRef.current) clearTimeout(msgActivityFlushRef.current);
    };
  }, [activeId, myId]);

  const sendTyping = useCallback((typing: boolean) => {
    if (!activeId) return;
    const now = Date.now();
    const state = sendTypingRef.current;
    if (typing) {
      if (state.idleTimer) { clearTimeout(state.idleTimer); state.idleTimer = null; }
      state.idleTimer = setTimeout(() => sendTyping(false), 5000);
      if (state.lastValue === true && now - state.lastSent < 3000) return;
    } else {
      if (state.idleTimer) { clearTimeout(state.idleTimer); state.idleTimer = null; }
      if (state.lastValue === false) return;
    }
    state.lastValue = typing;
    state.lastSent = now;
    fetch(`/api/conversations/${activeId}/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typing }),
    }).catch(() => { /* ignore â€” best effort */ });
  }, [activeId]);

  useEffect(() => {
    sendTypingRef.current = { lastSent: 0, lastValue: null, idleTimer: null };
    return () => {
      if (sendTypingRef.current.idleTimer) clearTimeout(sendTypingRef.current.idleTimer);
    };
  }, [activeId]);

  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (searchAbortRef.current) searchAbortRef.current.abort();

    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }

    setSearchLoading(true);
    setSearchError(null);
    const controller = new AbortController();
    searchAbortRef.current = controller;
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const url = `/api/conversations/${activeId}/search?q=${encodeURIComponent(trimmed)}`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not search messages."));
        const data = (await response.json().catch(() => null)) as { results?: SearchResult[] } | null;
        if (controller.signal.aborted) return;
        setSearchResults(data?.results ?? []);
      } catch (error) {
        if ((error as { name?: string } | null)?.name === "AbortError") return;
        setSearchResults([]);
        setSearchError(error instanceof Error ? error.message : "Could not search messages.");
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 250);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      controller.abort();
    };
  }, [activeId, searchQuery]);

  function jumpToMessage(messageId: string) {
    setSearchOpen(false);
    setHighlightMessageId(messageId);
    setTimeout(() => {
      const target = document.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 30);
    setTimeout(() => setHighlightMessageId((current) => current === messageId ? null : current), 1800);
  }

  const cleanupRecorder = useCallback(() => {
    if (recAnalyserFrameRef.current != null) {
      cancelAnimationFrame(recAnalyserFrameRef.current);
      recAnalyserFrameRef.current = null;
    }
    if (recTickerRef.current) {
      clearInterval(recTickerRef.current);
      recTickerRef.current = null;
    }
    if (recStreamRef.current) {
      for (const track of recStreamRef.current.getTracks()) track.stop();
      recStreamRef.current = null;
    }
    if (recAudioContextRef.current) {
      recAudioContextRef.current.close().catch(() => { /* ignore */ });
      recAudioContextRef.current = null;
    }
    recMediaRecorderRef.current = null;
  }, []);

  useEffect(() => () => {
    cleanupRecorder();
    if (recPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(recPreviewUrl);
  }, [cleanupRecorder, recPreviewUrl]);

  async function startVoiceRecording() {
    if (recState !== "idle" || sending || isRequest) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      showError("Microphone is not available in this browser.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      showError("Microphone permission was denied.");
      return;
    }
    let mimeType = "";
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    for (const candidate of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
        mimeType = candidate; break;
      }
    }
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      showError("Recording is not supported in this browser.");
      return;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) chunks.push(event.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      recBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setRecPreviewUrl((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return url;
      });
      setRecState("preview");
    };

    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.frequencyBinCount);
    const peaks: number[] = [];
    let lastSampleAt = 0;
    const sample = (timestamp: number) => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const value = ((buffer[i] ?? 0) - 128) / 128;
        sum += value * value;
      }
      const rms = Math.sqrt(sum / buffer.length);
      if (timestamp - lastSampleAt >= 80) {
        lastSampleAt = timestamp;
        peaks.push(Math.min(1, rms * 1.6));
        if (peaks.length > 64) peaks.shift();
        setRecPeaks([...peaks]);
      }
      recAnalyserFrameRef.current = requestAnimationFrame(sample);
    };

    recStreamRef.current = stream;
    recAudioContextRef.current = ctx;
    recMediaRecorderRef.current = recorder;
    recBlobRef.current = null;
    recStartedAtRef.current = Date.now();
    setRecPeaks([]);
    setRecDurationMs(0);
    if (recPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(recPreviewUrl);
    setRecPreviewUrl(null);

    recTickerRef.current = setInterval(() => {
      const elapsed = Date.now() - recStartedAtRef.current;
      setRecDurationMs(elapsed);
      if (elapsed >= 120_000) stopVoiceRecording();
    }, 200);

    recorder.start(250);
    recAnalyserFrameRef.current = requestAnimationFrame(sample);
    setRecState("recording");
  }

  function stopVoiceRecording() {
    if (recState !== "recording") return;
    const recorder = recMediaRecorderRef.current;
    if (recAnalyserFrameRef.current != null) {
      cancelAnimationFrame(recAnalyserFrameRef.current);
      recAnalyserFrameRef.current = null;
    }
    if (recTickerRef.current) { clearInterval(recTickerRef.current); recTickerRef.current = null; }
    if (recStreamRef.current) {
      for (const track of recStreamRef.current.getTracks()) track.stop();
      recStreamRef.current = null;
    }
    try { recorder?.stop(); } catch { /* ignore */ }
  }

  function cancelVoiceRecording() {
    cleanupRecorder();
    recBlobRef.current = null;
    if (recPreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(recPreviewUrl);
    setRecPreviewUrl(null);
    setRecPeaks([]);
    setRecDurationMs(0);
    setRecState("idle");
  }

  async function sendVoiceMessage() {
    const blob = recBlobRef.current;
    if (!blob || !activeId || !myId) return;
    if (recPeaks.length === 0) {
      showError("Recording is too short.");
      return;
    }
    setRecState("uploading");
    try {
      const fd = new FormData();
      const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : blob.type.includes("mpeg") ? "mp3" : "webm";
      fd.append("file", blob, `voice-${Date.now()}.${ext}`);
      fd.append("purpose", "voice");
      const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
      if (!uploadRes.ok) throw new Error(await apiErrorMessage(uploadRes, "Could not upload voice message."));
      const uploadData = (await uploadRes.json().catch(() => null)) as { url?: string } | null;
      if (!uploadData?.url) throw new Error("Could not upload voice message.");

      const downsampled = downsamplePeaks(recPeaks, 32).map((value) => value.toFixed(2)).join(",");
      const mediaUrl = `${uploadData.url}#waveform=${downsampled}`;

      const opt: ApiMessage = {
        id: "opt-" + Date.now(),
        text: "",
        mediaUrl,
        senderId: myId,
        createdAt: new Date().toISOString(),
        sender: me ?? { id: myId, username: "", displayName: "You", avatarUrl: null },
        reactions: [],
        replyTo: null,
      };
      setMsgs((p) => [...p, opt]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);

      const sendRes = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: activeId, text: "", mediaUrl, replyToId: null }),
      });
      if (!sendRes.ok) throw new Error(await apiErrorMessage(sendRes, "Could not send voice message."));
      const sendData = await sendRes.json();
      setMsgs((p) => p.map((m) => m.id === opt.id ? { ...sendData.message, replyTo: null } : m));
      setConvos((p) => p.map((c) => c.id === activeId
        ? {
            ...c,
            lastMessage: {
              text: "",
              mediaUrl,
              createdAt: new Date().toISOString(),
              senderId: myId,
              read: false,
            },
            updatedAt: new Date().toISOString(),
          }
        : c));
      cancelVoiceRecording();
    } catch (error) {
      setRecState("preview");
      showError(error instanceof Error ? error.message : "Could not send voice message.");
    }
  }

  function pick(id: string) {
    setPrefs((prev) => {
      const entry = prev[id];
      if (!entry?.markUnread) return prev;
      const next = { ...prev, [id]: { ...entry, markUnread: false } };
      try {
        localStorage.setItem("linksy-conversation-prefs", JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
    setActiveId(id); setMsgs([]); setDetailOpen(false); setReactionPickerFor(null); setMoreMenuFor(null); setDidInitialMessagesLoad(false); setReplyTarget(null); setPinnedMessageId(null); setIsChatBlocked(false);
    if (window.innerWidth < 768) setMobileSide(false);
  }

  async function acceptRequest(id: string) {
    try {
      const r = await fetch("/api/conversations/accept", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id }),
      }).catch(() => null);
      if (!r?.ok) throw new Error(await apiErrorMessage(r, "Could not accept the request."));

      const moved = requests.find(c => c.id === id);
      if (moved) {
        setRequests(p => p.filter(c => c.id !== id));
        setConvos(p => [{ ...moved }, ...p]);
      }
      pick(id);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not accept the request.");
    }
  }

  async function send() {
    const text = input.trim();
    // `sendingRef` is authoritative — survives HMR resets that can leak
    // a stale `sending=true` from a previous render whose POST never
    // completed.
    if ((!text && !attachmentFile) || !activeId || !myId || sendingRef.current) {
      return;
    }

    // Validate FIRST. Any `return` past this guard claims the sendingRef
    // lock, so an early-out without releasing it would silently brick the
    // composer for the rest of the session.
    if (attachmentFile) {
      if (!(attachmentFile.type.startsWith("image/") || attachmentFile.type.startsWith("video/"))) {
        showError("Only image or video files are supported.");
        return;
      }
      if (attachmentFile.size <= 0 || attachmentFile.size > 20 * 1024 * 1024) {
        showError("Attachment must be 20MB or less.");
        return;
      }
    }

    sendingRef.current = true;
    setSending(true);

    let uploadedMediaUrl: string | undefined;
    const opt: ApiMessage = {
      id: "opt-" + Date.now(), text, mediaUrl: attachmentPreview ?? null, senderId: myId,
      createdAt: new Date().toISOString(),
      sender: me ?? { id: myId, username: "", displayName: "You", avatarUrl: null },
      reactions: [],
      replyTo: replyTarget
        ? {
            messageId: replyTarget.id,
            senderName: replyTarget.sender.displayName,
            preview: replyTarget.text.trim() || (isVideoMediaUrl(replyTarget.mediaUrl) ? "Video" : "Photo"),
          }
        : null,
    };
    setMsgs(p => [...p, opt]);
    setInput("");
    sendTyping(false);
    if (attachmentPreview?.startsWith("blob:")) URL.revokeObjectURL(attachmentPreview);
    setAttachmentFile(null);
    setAttachmentPreview(null);
    setComposeAdult(false);
    if (fileRef.current) fileRef.current.value = "";
    if (taRef.current) taRef.current.style.height = "auto";
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    try {
      if (attachmentFile) {
        const fd = new FormData();
        fd.append("file", attachmentFile);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
        if (!uploadRes.ok) {
          throw new Error(await apiErrorMessage(uploadRes, "Could not upload media."));
        }
        const uploadData = (await uploadRes.json().catch(() => null)) as { url?: string } | null;
        if (!uploadData?.url) throw new Error("Could not upload media.");
        uploadedMediaUrl = uploadData.url;
      }
      const r = await fetch("/api/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: activeId,
          text,
          mediaUrl: uploadedMediaUrl,
          replyToId: opt.replyTo?.messageId ?? null,
          containsAdultContent: composeAdult || undefined,
        }),
      });
      if (!r.ok) {
        const errText = await apiErrorMessage(r, "Could not send the message.");
        throw new Error(errText);
      }

      const d = await r.json();
      if (!d?.message?.id) {
        throw new Error("Server didn't confirm the message — refresh to check if it was saved.");
      }
      setMsgs(p => p.map(m => m.id === opt.id ? { ...d.message, replyTo: d.message?.replyTo ?? opt.replyTo } : m));
      setConvos(p => p.map(c => c.id === activeId
        ? {
            ...c,
            lastMessage: {
              text,
              mediaUrl: uploadedMediaUrl ?? null,
              createdAt: new Date().toISOString(),
              senderId: myId,
              read: false,
            },
            updatedAt: new Date().toISOString(),
          }
        : c));
      setReplyTarget(null);
    } catch (error) {
      setMsgs(p => p.filter(m => m.id !== opt.id));
      setInput(text);
      if (attachmentFile) {
        setAttachmentFile(attachmentFile);
        // `createObjectURL` itself can throw if the File handle is dead
        // (e.g. the input was reset). Guard so a recovery attempt never
        // bubbles up and skips the `finally` reset of `sending`.
        try {
          const restored = URL.createObjectURL(attachmentFile);
          setAttachmentPreview(restored);
        } catch { /* preview restore is best-effort */ }
      }
      setTimeout(() => { if (taRef.current) taRef.current.style.height = Math.min(taRef.current.scrollHeight, 120) + "px"; }, 0);
      showError(error instanceof Error ? error.message : "Could not send the message.");
    } finally {
      // ALWAYS clear sending — without this a thrown catch block (e.g.
      // createObjectURL failure above) would leave the composer locked,
      // matching the "can't send a second message" symptom users reported.
      sendingRef.current = false;
      setSending(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }
  function resize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const t = e.target; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px";
    if (e.target.value.trim().length > 0) {
      sendTyping(true);
    } else {
      sendTyping(false);
    }
  }

  const handleReplyToMessage = useCallback((message: ApiMessage) => {
    setReplyTarget(message);
    setTimeout(() => taRef.current?.focus(), 0);
  }, []);

  const handleReactToMessage = useCallback(async (messageId: string, emoji: string) => {
    try {
      const response = await fetch(`/api/messages/${messageId}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not react to message."));
      const payload = (await response.json().catch(() => null)) as { reactions?: ApiMessageReaction[] } | null;
      const nextReactions = payload?.reactions ?? [];
      setMsgs((current) => current.map((item) => item.id === messageId ? { ...item, reactions: nextReactions } : item));
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not react to message.");
    }
  }, [showError]);

  const handleForwardMessage = useCallback((message: ApiMessage) => {
    const summary = message.text.trim() || message.mediaUrl || "";
    if (!summary) {
      showError("Nothing to forward.");
      return;
    }
    navigator.clipboard.writeText(summary).then(() => {
      showError("Forward content copied.");
    }).catch(() => {
      showError("Could not copy forward content.");
    });
  }, [showError]);

  async function handleRenameGroup() {
    if (!activeId) return;
    const next = groupNameDraft.trim();
    if (!next) {
      showError("Group name cannot be empty.");
      return;
    }
    setGroupNameBusy(true);
    try {
      const response = await fetch(`/api/conversations/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not rename group."));
      const data = (await response.json().catch(() => null)) as { conversation?: { name: string } } | null;
      const updatedName = data?.conversation?.name ?? next;
      setConvos((current) => current.map((c) => c.id === activeId ? { ...c, name: updatedName } : c));
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not rename group.");
    } finally {
      setGroupNameBusy(false);
    }
  }

  async function handleRemoveMember(targetUserId: string) {
    if (!activeId) return;
    if (!window.confirm("Remove this member from the group?")) return;
    const previous = convos;
    setConvos((current) => current.map((c) => {
      if (c.id !== activeId) return c;
      return { ...c, members: c.members.filter((m) => m.id !== targetUserId) };
    }));
    setMemberMenuOpen(null);
    try {
      const response = await fetch(
        `/api/conversations/${activeId}/members/${encodeURIComponent(targetUserId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not remove member."));
      showSuccess(language === "mn" ? "✓ Гишүүн хасагдлаа" : "✓ Member removed");
    } catch (error) {
      setConvos(previous);
      showError(error instanceof Error ? error.message : "Could not remove member.");
    }
  }

  async function handleChangeMemberRole(targetUserId: string, role: "MEMBER" | "ADMIN") {
    if (!activeId) return;
    const previous = convos;
    setConvos((current) => current.map((c) => {
      if (c.id !== activeId) return c;
      const nextMembers = c.members.map((m) => m.id === targetUserId ? { ...m, role } : m);
      const nextMyRole = targetUserId === myId ? role : c.myRole;
      return { ...c, members: nextMembers, myRole: nextMyRole };
    }));
    try {
      const response = await fetch(`/api/conversations/${activeId}/members/${targetUserId}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not update member role."));
    } catch (error) {
      setConvos(previous);
      showError(error instanceof Error ? error.message : "Could not update member role.");
    }
  }

  const handleTogglePinMessage = useCallback(async (messageId: string) => {
    if (!activeId) return;
    const previous = pinnedMessageId;
    const next = previous === messageId ? null : messageId;
    setPinnedMessageId(next);
    try {
      const response = await fetch(`/api/conversations/${activeId}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: next }),
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not update pinned message."));
      const payload = (await response.json().catch(() => null)) as { pinnedMessageId?: string | null } | null;
      setPinnedMessageId(payload?.pinnedMessageId ?? null);
    } catch (error) {
      setPinnedMessageId(previous);
      showError(error instanceof Error ? error.message : "Could not update pinned message.");
    }
  }, [activeId, pinnedMessageId, showError]);

  const handleDeleteForMe = useCallback((message: ApiMessage) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(message.id);
      try {
        window.localStorage.setItem("linksy:msg-hidden", JSON.stringify([...next]));
      } catch { /* storage full or denied */ }
      return next;
    });
    setReplyTarget((current) => current?.id === message.id ? null : current);
  }, []);

  const handleUnsendMessage = useCallback(async (message: ApiMessage) => {
    if (message.senderId !== myId) return;
    if (!window.confirm(ms.unsendConfirm)) return;
    try {
      const response = await fetch(`/api/messages/${message.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not unsend message."));
      const payload = (await response.json().catch(() => null)) as { hardDeleted?: boolean; deletedAt?: string } | null;
      if (payload?.hardDeleted) {
        setMsgs((current) => current.filter((item) => item.id !== message.id));
      } else {
        const deletedAt = payload?.deletedAt ?? new Date().toISOString();
        setMsgs((current) => current.map((item) => item.id === message.id
          ? { ...item, text: "", mediaUrl: null, deletedAt, reactions: [] }
          : item,
        ));
      }
      if (pinnedMessageId === message.id) {
        setPinnedMessageId(null);
        if (activeId) {
          fetch(`/api/conversations/${activeId}/pin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId: null }),
          }).catch(() => { /* best effort */ });
        }
      }
      setReplyTarget((current) => current?.id === message.id ? null : current);
      if (activeId) {
        await loadConvos();
      }
      showError("Message unsent.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not unsend message.");
    }
  }, [myId, ms, activeId, pinnedMessageId, loadConvos, showError]);

  const handleEditMessage = useCallback(async (message: ApiMessage) => {
    if (message.senderId !== myId || message.deletedAt) return;
    const next = window.prompt("Edit message", message.text);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      showError("Message text is required.");
      return;
    }
    if (trimmed === message.text.trim()) return;
    try {
      const response = await fetch(`/api/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not edit message."));
      const payload = (await response.json().catch(() => null)) as { message?: { id: string; text: string; editedAt: string | null } } | null;
      const editedAt = payload?.message?.editedAt ?? new Date().toISOString();
      const newText = payload?.message?.text ?? trimmed;
      setMsgs((current) => current.map((item) => item.id === message.id
        ? { ...item, text: newText, editedAt }
        : item,
      ));
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not edit message.");
    }
  }, [myId, showError]);

  const active = [...convos, ...requests].find(c => c.id === activeId) ?? null;
  const other  = active?.otherUser ?? null;
  const isRequest = requests.some(c => c.id === activeId);

  // Subscribe to peer presence in 1:1 chats: SSE pushes online/offline
  // transitions; the server-side TTL sweep covers silent client crashes.
  useEffect(() => {
    setPeerPresence(null);
    if (!other?.id || active?.isGroup) return;

    const peerId = other.id;
    const es = new EventSource(
      `/api/presence/stream?users=${encodeURIComponent(peerId)}`,
      { withCredentials: true },
    );

    const onInitial = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as {
          users: { userId: string; online: boolean; lastSeenAt: string | null }[];
        };
        const entry = data.users.find((u) => u.userId === peerId);
        if (entry) setPeerPresence({ online: entry.online, lastSeenAt: entry.lastSeenAt });
      } catch { /* ignore */ }
    };
    const onPresence = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { userId: string; online: boolean };
        if (data.userId === peerId) {
          setPeerPresence((prev) => ({
            online: data.online,
            lastSeenAt: data.online ? null : (prev?.lastSeenAt ?? new Date().toISOString()),
          }));
        }
      } catch { /* ignore */ }
    };
    es.addEventListener("initial", onInitial);
    es.addEventListener("presence", onPresence);
    es.onerror = () => { /* EventSource auto-reconnects */ };

    return () => {
      es.removeEventListener("initial", onInitial);
      es.removeEventListener("presence", onPresence);
      es.close();
    };
  }, [other?.id, active?.isGroup]);

  const activePrefs = activeId ? prefs[activeId] ?? {} : {};
  const effectiveActiveName = active
    ? (activePrefs.nickname?.trim() || (active.isGroup ? (active.name ?? ms.groupFallback) : (other?.displayName ?? "?")))
    : "";
  const tabList = sideTab === "direct"
    ? convos.filter(c => !c.isGroup)
    : sideTab === "group"
    ? convos.filter(c => c.isGroup)
    : requests;

  // Muted convos contribute zero to the tab badges — the whole point of
  // mute is "I don't want to be alerted by this thread". They still
  // show their own per-row unread count so the user can scroll through
  // and read, but they don't inflate the Direct / Groups badges.
  const tabUnreadCounts = useMemo(() => {
    const unreadOf = (c: typeof convos[number]) =>
      prefs[c.id]?.muted ? 0 : (c.unread ?? 0);
    const direct = convos.reduce((sum, c) => sum + (!c.isGroup ? unreadOf(c) : 0), 0);
    const group = convos.reduce((sum, c) => sum + (c.isGroup ? unreadOf(c) : 0), 0);
    return { direct, group, requests: requests.length };
  }, [convos, requests, prefs]);

  const filtered = tabList.filter(c =>
    !search
    || (prefs[c.id]?.nickname?.trim() || (c.isGroup ? c.name : c.otherUser?.displayName) || "")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const sidebarConvos = useMemo(() => {
    const pinned = filtered.filter((c) => prefs[c.id]?.pinnedToTop);
    const rest = filtered.filter((c) => !prefs[c.id]?.pinnedToTop);
    return [...pinned, ...rest];
  }, [filtered, prefs]);

  useEffect(() => {
    if (!convoContext) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConvoContext(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [convoContext]);

  function savePrefs(next: LocalConversationPrefs) {
    setPrefs(next);
    try {
      localStorage.setItem("linksy-conversation-prefs", JSON.stringify(next));
    } catch {
      // ignore storage failures
    }
  }

  function setConversationMuted(conversationId: string, muted: boolean) {
    const next = {
      ...prefs,
      [conversationId]: { ...(prefs[conversationId] ?? {}), muted },
    };
    savePrefs(next);
  }

  function setConversationNickname(conversationId: string, nickname: string) {
    const trimmed = nickname.trim();
    const current = prefs[conversationId] ?? {};
    const nextEntry = { ...current, nickname: trimmed || undefined };
    const next = { ...prefs, [conversationId]: nextEntry };
    savePrefs(next);
  }

  function setConversationTheme(conversationId: string, theme: ConversationTheme) {
    const current = prefs[conversationId] ?? {};
    const nextEntry = { ...current, theme: theme === "default" ? undefined : theme };
    const next = { ...prefs, [conversationId]: nextEntry };
    savePrefs(next);
  }

  function openConvoContextMenu(e: React.MouseEvent, conversationId: string) {
    e.preventDefault();
    e.stopPropagation();
    const menuW = 220;
    const menuH = 200;
    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - menuW - 8));
    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - menuH - 8));
    setConvoContext({ id: conversationId, x, y });
  }

  function markConvoUnreadFromMenu(conversationId: string) {
    setConvoContext(null);
    const next = {
      ...prefs,
      [conversationId]: { ...(prefs[conversationId] ?? {}), markUnread: true },
    };
    savePrefs(next);
  }

  function toggleConvoPinnedToTop(conversationId: string) {
    setConvoContext(null);
    const cur = prefs[conversationId]?.pinnedToTop;
    const next = {
      ...prefs,
      [conversationId]: { ...(prefs[conversationId] ?? {}), pinnedToTop: !cur },
    };
    savePrefs(next);
  }

  function toggleMuteFromContext(conversationId: string) {
    setConvoContext(null);
    const muted = !prefs[conversationId]?.muted;
    setConversationMuted(conversationId, muted);
  }

  async function deleteConvoFromSidebar(conversationId: string) {
    if (!window.confirm(ms.deleteChatConfirm)) return;
    setConvoContext(null);
    setActionBusy("delete");
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not delete chat."));
      setConvos((current) => current.filter((item) => item.id !== conversationId));
      setRequests((current) => current.filter((item) => item.id !== conversationId));
      if (activeId === conversationId) {
        setMsgs([]);
        setActiveId(null);
        setDetailOpen(false);
        if (window.innerWidth < 768) setMobileSide(true);
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not delete chat.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleDeleteChat() {
    if (!activeId || actionBusy) return;
    if (!window.confirm(ms.deleteChatConfirm)) return;

    setActionBusy("delete");
    try {
      const response = await fetch(`/api/conversations/${activeId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not delete chat."));
      setConvos((current) => current.filter((item) => item.id !== activeId));
      setRequests((current) => current.filter((item) => item.id !== activeId));
      setMsgs([]);
      setActiveId(null);
      setDetailOpen(false);
      if (window.innerWidth < 768) setMobileSide(true);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not delete chat.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleToggleChatBlock() {
    if (!activeId) return;
    const next = !isChatBlocked;
    const previous = isChatBlocked;
    setIsChatBlocked(next);
    try {
      const response = await fetch(`/api/conversations/${activeId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked: next }),
      });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not update chat block."));
    } catch (error) {
      setIsChatBlocked(previous);
      showError(error instanceof Error ? error.message : "Could not update chat block.");
    }
  }

  async function handleLeaveGroup() {
    if (!activeId || actionBusy) return;
    if (!window.confirm(ms.leaveGroupConfirm)) return;
    setActionBusy("delete");
    try {
      const response = await fetch(`/api/conversations/${activeId}/leave`, { method: "DELETE" });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not leave the group."));
      setConvos((current) => current.filter((item) => item.id !== activeId));
      setRequests((current) => current.filter((item) => item.id !== activeId));
      setMsgs([]);
      setActiveId(null);
      setDetailOpen(false);
      if (window.innerWidth < 768) setMobileSide(true);
      showSuccess(language === "mn" ? "✓ Бүлгээс гарлаа" : "✓ You left the group");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not leave the group.");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleBlockUser() {
    if (!other?.id || actionBusy) return;
    if (!window.confirm(ms.blockUserConfirmFmt(other.username))) return;

    setActionBusy("block");
    try {
      const response = await fetch(`/api/users/${other.id}/block`, { method: "POST" });
      if (!response.ok) throw new Error(await apiErrorMessage(response, "Could not block this user."));
      setConvos((current) => current.filter((item) => item.id !== activeId));
      setRequests((current) => current.filter((item) => item.id !== activeId));
      setMsgs([]);
      setActiveId(null);
      setDetailOpen(false);
      if (window.innerWidth < 768) setMobileSide(true);
      showError(ms.userBlockedToast);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Could not block this user.");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="ms-root">

      {/* â”€â”€ SIDEBAR â”€â”€ */}
      <aside className={`ms-side ${mobileSide ? "" : "ms-side--hide"}`}>
        <div className="ms-side-head">
          <h1 className="ms-side-title">{ms.sidebarTitle}</h1>
          <button className="ms-icon-btn" onClick={() => setCompose(true)} title={ms.newChatTitle}>
            <IcCompose />
          </button>
        </div>

        <div className="ms-search-wrap">
          <span className="ms-search-icon"><IcSearch /></span>
          <input className="ms-search" placeholder={ms.searchPh} value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="ms-list">
          {loadingC && [0,1,2,3,4].map(i => <SkeletonConvoItem key={i} />)}
          {!loadingC && filtered.length === 0 && (
            <div className="ms-hint">
              {sideTab === "requests" ? ms.noRequests : sideTab === "group" ? ms.noGroups : ms.noDirects}
            </div>
          )}
          {sidebarConvos.map(c => (
            <ConvoItem
              key={c.id}
              c={c}
              active={c.id === activeId}
              language={language}
              ms={ms}
              myId={myId}
              titleOverride={prefs[c.id]?.nickname?.trim() || undefined}
              muted={Boolean(prefs[c.id]?.muted)}
              pinnedToTop={Boolean(prefs[c.id]?.pinnedToTop)}
              markUnread={Boolean(prefs[c.id]?.markUnread)}
              onClick={() => pick(c.id)}
              onContextMenu={(e) => openConvoContextMenu(e, c.id)}
            />
          ))}
        </div>

        {/* â”€â”€ bottom tab bar â”€â”€ */}
        <div className="ms-side-tabs">
          <div className="ms-tabs-track">
            <button className={`ms-side-tab${sideTab === "direct" ? " ms-side-tab--on" : ""}`}
              onClick={() => setSideTab("direct")}>
              {ms.tabDirect}
              {tabUnreadCounts.direct > 0 && <span className="ms-req-badge">{tabUnreadCounts.direct}</span>}
            </button>
            <button className={`ms-side-tab${sideTab === "group" ? " ms-side-tab--on" : ""}`}
              onClick={() => setSideTab("group")}>
              {ms.tabGroups}
              {tabUnreadCounts.group > 0 && <span className="ms-req-badge">{tabUnreadCounts.group}</span>}
            </button>
            <button className={`ms-side-tab${sideTab === "requests" ? " ms-side-tab--on" : ""}`}
              onClick={() => setSideTab("requests")}>
              {ms.tabRequests}
              {tabUnreadCounts.requests > 0 && <span className="ms-req-badge">{tabUnreadCounts.requests}</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* â”€â”€ CHAT â”€â”€ */}
      <main
        className={`ms-main ${mobileSide && !activeId ? "ms-main--hide-mobile" : ""}`}
        data-conv-theme={activeId ? (prefs[activeId]?.theme ?? "default") : "default"}
      >
        {!activeId ? <Empty ms={ms} /> : (
          <>
            <header className="ms-head">
              <button className="ms-icon-btn ms-back" onClick={() => { setMobileSide(true); setActiveId(null); }}>
                <IcBack />
              </button>
              {active && !active.isGroup && other ? (
                <Link href={userProfileHref(other)} className="ms-head-profile-link" prefetch={false}>
                  <Av
                    name={other.displayName ?? "?"}
                    uid={other.id}
                    avatarUrl={other.avatarUrl}
                    size={38}
                    isGroup={false}
                  />
                  <div className="ms-head-info">
                    <span className="ms-head-name">
                      {effectiveActiveName}
                      {peerPresence?.online && (
                        <span
                          aria-label={ms.onlineAria}
                          title={ms.online}
                          style={{
                            display: "inline-block",
                            marginLeft: 8,
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: "#22c55e",
                            verticalAlign: "middle",
                            boxShadow: "0 0 0 2px rgba(34,197,94,0.18)",
                          }}
                        />
                      )}
                    </span>
                    <span className="ms-head-sub">
                      {peerPresence?.online
                        ? ms.activeNow
                        : peerPresence?.lastSeenAt
                          ? `${ms.lastSeenPrefix} ${messagesScreenLastSeen(peerPresence.lastSeenAt, language)}`
                          : `@${other.username}`}
                      {activeId && prefs[activeId]?.muted ? ` â€¢ ${ms.headMuted}` : ""}
                    </span>
                  </div>
                </Link>
              ) : active ? (
                <>
                  <Av
                    name={active.isGroup ? (active.name ?? ms.groupFallback) : (other?.displayName ?? "?")}
                    uid={other?.id ?? activeId}
                    avatarUrl={active.isGroup ? null : other?.avatarUrl}
                    size={38}
                    isGroup={active.isGroup}
                  />
                  <div className="ms-head-info">
                    <span className="ms-head-name">
                      {effectiveActiveName}
                      {!active.isGroup && peerPresence?.online && (
                        <span
                          aria-label={ms.onlineAria}
                          title={ms.online}
                          style={{
                            display: "inline-block",
                            marginLeft: 8,
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: "#22c55e",
                            verticalAlign: "middle",
                            boxShadow: "0 0 0 2px rgba(34,197,94,0.18)",
                          }}
                        />
                      )}
                    </span>
                    <span className="ms-head-sub">
                      {active.isGroup
                        ? ms.membersCount((active.members?.length ?? 0) + 1)
                        : peerPresence?.online
                          ? ms.activeNow
                          : peerPresence?.lastSeenAt
                            ? `${ms.lastSeenPrefix} ${messagesScreenLastSeen(peerPresence.lastSeenAt, language)}`
                            : `@${other?.username ?? ""}`}
                      {activeId && prefs[activeId]?.muted ? ` â€¢ ${ms.headMuted}` : ""}
                    </span>
                  </div>
                </>
              ) : null}
              <div className="ms-head-actions">
                <button
                  className={`ms-icon-btn${searchOpen ? " ms-icon-btn--on" : ""}`}
                  onClick={() => setSearchOpen((current) => !current)}
                  title={ms.searchMessagesTitle}
                >
                  <IcSearch />
                </button>
                <button
                  className="ms-icon-btn"
                  onClick={() => activeId && setCallMode({ kind: "outgoing", conversationId: activeId, callKind: "AUDIO" })}
                  disabled={!activeId || Boolean(callMode)}
                  title="Voice call"
                  aria-label="Start voice call"
                >
                  <IcPhone />
                </button>
                <button
                  className="ms-icon-btn"
                  onClick={() => activeId && setCallMode({ kind: "outgoing", conversationId: activeId, callKind: "VIDEO" })}
                  disabled={!activeId || Boolean(callMode)}
                  title="Video call"
                  aria-label="Start video call"
                >
                  <IcVideo />
                </button>
                {/* "Verify safety number" UI removed: the E2EE pipeline exists in
                    lib/e2ee/* but messages-screen.send() ships plaintext, so the
                    button would have given users a false sense of security. The
                    E2EESafetyNumberDialog component + /api/e2ee/* endpoints are
                    kept on disk so the feature can be re-enabled once send()
                    actually encrypts. */}
                <button className="ms-icon-btn" onClick={() => setDetailOpen((current) => !current)} title={ms.chatDetailsTitle}>
                  <IcInfo />
                </button>
              </div>
            </header>
            {callMode && (
              <CallSurface
                mode={callMode}
                peerLabel={other?.displayName ?? other?.username ?? active?.name ?? "Linksy user"}
                peerAvatarUrl={other?.avatarUrl ?? null}
                onClosed={(finalStatus) => {
                  console.log(`[messages-screen] CallSurface onClosed(${finalStatus}) — clearing callMode`);
                  setCallMode(null);
                }}
              />
            )}

            {searchOpen && (
              <div className="ms-search-panel">
                <div className="ms-search-row">
                  <span className="ms-search-icon"><IcSearch /></span>
                  <input
                    autoFocus
                    type="text"
                    className="ms-search-input"
                    placeholder={ms.searchInConvoPh}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="ms-search-clear"
                      onClick={() => setSearchQuery("")}
                      title={ms.clearTitle}
                    >
                      <IcX />
                    </button>
                  )}
                </div>
                {searchError && <div className="ms-search-status">{searchError}</div>}
                {!searchError && searchQuery.trim() && (
                  <div className="ms-search-results">
                    {searchLoading && <div className="ms-search-status">{ms.searching}</div>}
                    {!searchLoading && searchResults.length === 0 && (
                      <div className="ms-search-status">{ms.noSearchResults}</div>
                    )}
                    {!searchLoading && searchResults.map((result) => (
                      <button
                        type="button"
                        key={result.id}
                        className="ms-search-result"
                        onClick={() => jumpToMessage(result.id)}
                      >
                        <Av
                          name={result.sender.displayName}
                          uid={result.sender.id}
                          avatarUrl={result.sender.avatarUrl}
                          size={28}
                        />
                        <div className="ms-search-result-body">
                          <div className="ms-search-result-head">
                            <span className="ms-search-result-name">{result.sender.displayName}</span>
                            <span className="ms-search-result-time">
                              {new Date(result.createdAt).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                            </span>
                          </div>
                          <div className="ms-search-result-snippet">{result.snippet}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* request banner */}
            {isRequest && (
              <div className="ms-req-banner">
                <span>{ms.reqBanner}</span>
                <button className="ms-req-accept" onClick={() => acceptRequest(activeId!)}>
                  {ms.accept}
                </button>
              </div>
            )}

            {isChatBlocked && !isRequest && (
              <div className="ms-req-banner ms-req-banner--block">
                <span>{ms.blockBanner}</span>
                <button className="ms-req-accept" onClick={handleToggleChatBlock}>
                  {ms.unblock}
                </button>
              </div>
            )}

            <div
              ref={feedRef}
              className="ms-feed"
              onClick={() => {
                setReactionPickerFor(null);
                setMoreMenuFor(null);
              }}
            >
              {pinnedMessageId ? (
                <button
                  type="button"
                  className="ms-pinned-bar"
                  onClick={(event) => {
                    event.stopPropagation();
                    const target = document.querySelector(`[data-message-id="${pinnedMessageId}"]`);
                    target?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  <span className="ms-pinned-icon"><IcPin /></span>
                  <span className="ms-pinned-text">
                    {(() => {
                      const pinned = msgs.find((m) => m.id === pinnedMessageId);
                      if (!pinned) return ms.pinnedMsg;
                      return pinned.text.trim() || (isVideoMediaUrl(pinned.mediaUrl) ? ms.pinnedVideo : ms.pinnedPhoto);
                    })()}
                  </span>
                </button>
              ) : null}
              {loadingM && msgs.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", padding: "1rem 0" }}>
                  <SkeletonMessage />
                  <SkeletonMessage mine />
                  <SkeletonMessage />
                  <SkeletonMessage mine />
                  <SkeletonMessage />
                </div>
              )}

              {!loadingM && msgs.length === 0 && (
                <div className="ms-convo-start">
                  {active && (
                    <Av
                      name={active.isGroup ? (active.name ?? ms.groupFallback) : (other?.displayName ?? "?")}
                      uid={other?.id ?? activeId}
                      avatarUrl={active.isGroup ? null : other?.avatarUrl}
                      size={64}
                      isGroup={active.isGroup}
                    />
                  )}
                  <p className="ms-convo-name">{effectiveActiveName}</p>
                  <p className="ms-convo-hint">{ms.convoStartHint}</p>
                </div>
              )}

              {msgs[0] && (
                <div className="ms-date-chip">
                  {new Date(msgs[0].createdAt).toLocaleDateString(locale, { month: "long", day: "numeric" })}
                </div>
              )}

              {visibleMsgs.map((m, i, arr) => {
                const nextSame = i < arr.length - 1 && arr[i+1]?.senderId === m.senderId;
                return (
                  <Bubble
                    key={m.id}
                    msg={m}
                    myId={myId}
                    locale={locale}
                    ms={ms}
                    showAv={m.senderId !== myId && !nextSame}
                    onReply={handleReplyToMessage}
                    onReact={handleReactToMessage}
                    onForward={handleForwardMessage}
                    onTogglePin={handleTogglePinMessage}
                    onUnsend={handleUnsendMessage}
                    onDeleteForMe={handleDeleteForMe}
                    onEdit={handleEditMessage}
                    isPinned={pinnedMessageId === m.id}
                    isHighlighted={highlightMessageId === m.id}
                    openMoreMenuFor={moreMenuFor}
                    setOpenMoreMenuFor={setMoreMenuFor}
                    openReactionPickerFor={reactionPickerFor}
                    setOpenReactionPickerFor={setReactionPickerFor}
                  />
                );
              })}
              {typingPeers[0] && (
                <div className="ms-typing-row" aria-live="polite">
                  <Av
                    name={typingPeers[0].displayName}
                    uid={typingPeers[0].id}
                    avatarUrl={typingPeers[0].avatarUrl}
                    size={26}
                  />
                  <div className="ms-typing-bubble">
                    <span className="ms-typing-dot" />
                    <span className="ms-typing-dot" />
                    <span className="ms-typing-dot" />
                  </div>
                  <span className="ms-typing-label">
                    {ms.typingLine(typingPeers)}
                  </span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Adult-content composer toggle. Renders only for 18+ viewers
                (via `useViewerIsAdult` inside the component). Mounted ABOVE
                the compose bar so it's visible while drafting; resets to
                off after each send via `send()` cleanup. */}
            <div style={{ display: "flex", justifyContent: "center", padding: "6px 12px 0" }}>
              <AdultContentToggle
                checked={composeAdult}
                onChange={setComposeAdult}
              />
            </div>

            <div className="ms-compose">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (!file) return;
                  if (!(file.type.startsWith("image/") || file.type.startsWith("video/"))) {
                    showError(ms.errImageOnly);
                    return;
                  }
                  if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
                    showError(ms.errAttachSize);
                    return;
                  }
                  if (attachmentPreview?.startsWith("blob:")) URL.revokeObjectURL(attachmentPreview);
                  setAttachmentFile(file);
                  setAttachmentPreview(URL.createObjectURL(file));
                }}
              />
              <button className="ms-compose-btn" onClick={() => fileRef.current?.click()} disabled={isRequest || isChatBlocked}><IcAttach /></button>
              <div className="ms-compose-box">
                <button className="ms-compose-emoji"><IcEmoji /></button>
                {replyTarget ? (
                  <div className="ms-reply-draft">
                    <div className="ms-reply-draft-text">
                      <span>{ms.composeReplyingTo} {replyTarget.sender.displayName}</span>
                      <small>{replyTarget.text.trim() || (isVideoMediaUrl(replyTarget.mediaUrl) ? ms.composeVideo : ms.composePhoto)}</small>
                    </div>
                    <button
                      type="button"
                      className="ms-reply-draft-close"
                      onClick={() => setReplyTarget(null)}
                    >
                      <IcX />
                    </button>
                  </div>
                ) : null}
                {attachmentPreview ? (
                  <div className="ms-compose-attachment">
                    {isVideoMediaUrl(attachmentPreview) ? (
                      <video src={attachmentPreview} className="ms-compose-attachment-media" />
                    ) : (
                      <Image
                        src={attachmentPreview}
                        className="ms-compose-attachment-media"
                        alt=""
                        width={400}
                        height={400}
                        sizes="200px"
                        unoptimized={shouldUnoptimizeNextImageSrc(attachmentPreview)}
                      />
                    )}
                    <button
                      type="button"
                      className="ms-compose-attachment-remove"
                      onClick={() => {
                        if (attachmentPreview?.startsWith("blob:")) URL.revokeObjectURL(attachmentPreview);
                        setAttachmentFile(null);
                        setAttachmentPreview(null);
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                    >
                      <IcX />
                    </button>
                  </div>
                ) : null}
                {recState === "idle" ? (
                  <textarea ref={taRef} className="ms-compose-ta" rows={1}
                    placeholder={isChatBlocked ? ms.composeBlockedPh : (other?.displayName?.split(" ")[0] ?? ms.composeMessagePh)}
                    value={input} onChange={resize} onKeyDown={onKey}
                    disabled={isRequest || isChatBlocked}
                  />
                ) : (
                  <div className="ms-voice-strip">
                    {recState === "recording" && (
                      <>
                        <span className="ms-voice-rec-dot" />
                        <span className="ms-voice-time">{formatDuration(recDurationMs)}</span>
                        <div className="ms-voice-wave">
                          {(recPeaks.length > 0 ? recPeaks : [0.05]).slice(-32).map((peak, idx) => (
                            <span key={idx} className="ms-voice-bar" style={{ height: `${Math.max(8, Math.round(peak * 100))}%` }} />
                          ))}
                        </div>
                      </>
                    )}
                    {(recState === "preview" || recState === "uploading") && (
                      <>
                        <span className="ms-voice-time">{formatDuration(recDurationMs)}</span>
                        <div className="ms-voice-wave ms-voice-wave--preview">
                          {downsamplePeaks(recPeaks, 32).map((peak, idx) => (
                            <span key={idx} className="ms-voice-bar" style={{ height: `${Math.max(8, Math.round(peak * 100))}%` }} />
                          ))}
                        </div>
                        {recPreviewUrl && <audio src={recPreviewUrl} controls className="ms-voice-preview-audio" />}
                      </>
                    )}
                  </div>
                )}
                {recState === "idle" && !input.trim() && !attachmentFile && (
                  <button
                    type="button"
                    className="ms-compose-send ms-compose-mic"
                    onClick={startVoiceRecording}
                    disabled={isRequest || isChatBlocked}
                    title={ms.recordVoiceTitle}
                    style={{ "--mc": other ? colorFor(other.id) : "#6366f1" } as React.CSSProperties}
                  >
                    <IcMic />
                  </button>
                )}
                {recState === "recording" && (
                  <>
                    <button
                      type="button"
                      className="ms-compose-send ms-compose-mic ms-compose-mic--cancel"
                      onClick={cancelVoiceRecording}
                      title={ms.cancelRecTitle}
                    >
                      <IcX />
                    </button>
                    <button
                      type="button"
                      className="ms-compose-send"
                      onClick={stopVoiceRecording}
                      title={ms.finishRecTitle}
                      style={{ "--mc": other ? colorFor(other.id) : "#6366f1" } as React.CSSProperties}
                    >
                      <IcStop />
                    </button>
                  </>
                )}
                {(recState === "preview" || recState === "uploading") && (
                  <>
                    <button
                      type="button"
                      className="ms-compose-send ms-compose-mic ms-compose-mic--cancel"
                      onClick={cancelVoiceRecording}
                      disabled={recState === "uploading"}
                      title={ms.discardVoiceTitle}
                    >
                      <IcTrash />
                    </button>
                    <button
                      type="button"
                      className="ms-compose-send"
                      onClick={sendVoiceMessage}
                      disabled={recState === "uploading"}
                      title={ms.sendVoiceTitle}
                      style={{ "--mc": other ? colorFor(other.id) : "#6366f1" } as React.CSSProperties}
                    >
                      <IcSend />
                    </button>
                  </>
                )}
                {recState === "idle" && (input.trim() || attachmentFile) && (
                  <button className="ms-compose-send" onClick={send} disabled={sending || isRequest || isChatBlocked}
                    style={{ "--mc": other ? colorFor(other.id) : "#6366f1" } as React.CSSProperties}>
                    <IcSend />
                  </button>
                )}
              </div>
            </div>

            {detailOpen && active && (
              <aside className="ms-detail">
                <div className="ms-detail-head">
                  <span>{ms.detailTitle}</span>
                  <button className="ms-icon-btn" onClick={() => setDetailOpen(false)}>
                    <IcX />
                  </button>
                </div>

                {/* Hero card: avatar + name + handle (direct = user / group = chat) */}
                <div className="ms-detail-hero">
                  {active.isGroup ? (
                    <div className="ms-detail-hero-stack" aria-hidden>
                      {active.members.slice(0, 3).map((m, i) => (
                        <span key={m.id} className={`ms-detail-hero-stack-av ms-detail-hero-stack-av--${i}`}>
                          <Av name={m.displayName} uid={m.id} avatarUrl={m.avatarUrl} size={44} />
                        </span>
                      ))}
                    </div>
                  ) : other ? (
                    <Av name={other.displayName} uid={other.id} avatarUrl={other.avatarUrl} size={64} />
                  ) : null}
                  <div className="ms-detail-hero-text">
                    <p className="ms-detail-hero-title">
                      {active.isGroup ? (active.name ?? "Group chat") : other?.displayName ?? ""}
                    </p>
                    <p className="ms-detail-hero-sub">
                      {active.isGroup
                        ? `${active.members.length + 1} members`
                        : other ? `@${other.username}` : ""}
                    </p>
                    {!active.isGroup && other ? (
                      <a className="ms-detail-hero-link" href={`/${encodeURIComponent(other.username)}`}>
                        View profile
                      </a>
                    ) : null}
                  </div>
                </div>

                {active.isGroup && active.myRole === "ADMIN" ? (
                  <div className="ms-detail-field">
                    <label>Change group name</label>
                    <div className="ms-detail-row">
                      <input
                        value={groupNameDraft}
                        onChange={(event) => setGroupNameDraft(event.target.value)}
                        placeholder={active.name ?? "Group name"}
                        maxLength={80}
                      />
                      <button
                        type="button"
                        onClick={handleRenameGroup}
                        disabled={groupNameBusy || !groupNameDraft.trim() || groupNameDraft.trim() === (active.name ?? "")}
                      >
                        {groupNameBusy ? "â€¦" : "Change"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {!active.isGroup ? (
                  <div className="ms-detail-field">
                    <label>{ms.nicknameLabel}</label>
                    <div className="ms-detail-row">
                      <input
                        value={nicknameDraft}
                        onChange={(event) => setNicknameDraft(event.target.value)}
                        placeholder={other?.displayName ?? ms.nicknamePh}
                        maxLength={60}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeId) return;
                          setConversationNickname(activeId, nicknameDraft);
                        }}
                      >
                        {ms.save}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="ms-detail-field">
                  <label>Theme</label>
                  <div className="ms-theme-swatches" role="radiogroup" aria-label="Conversation theme">
                    {CONVERSATION_THEME_OPTIONS.map((opt) => {
                      const current = (activeId && prefs[activeId]?.theme) || "default";
                      const selected = current === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          title={opt.label}
                          className={`ms-theme-swatch${selected ? " ms-theme-swatch--on" : ""}`}
                          style={{ background: opt.gradient }}
                          onClick={() => activeId && setConversationTheme(activeId, opt.key)}
                        >
                          {selected ? (
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M5 13l4 4 10-10" />
                            </svg>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="ms-detail-section-label">Chat info</p>

                <div className="ms-detail-toggle-row">
                  <span className="ms-detail-toggle-label">{ms.muteChat.replace(/\?$/, "")}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(activeId && prefs[activeId]?.muted)}
                    className={`ms-detail-toggle${activeId && prefs[activeId]?.muted ? " ms-detail-toggle--on" : ""}`}
                    onClick={() => {
                      if (!activeId) return;
                      setConversationMuted(activeId, !Boolean(prefs[activeId]?.muted));
                    }}
                  >
                    <span className="ms-detail-toggle-knob" />
                  </button>
                </div>

                {!active.isGroup ? (
                  <div className="ms-detail-toggle-row">
                    <span className="ms-detail-toggle-label">{isChatBlocked ? ms.unblockThisChat : ms.blockThisChat}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isChatBlocked}
                      className={`ms-detail-toggle${isChatBlocked ? " ms-detail-toggle--on" : ""}`}
                      onClick={handleToggleChatBlock}
                    >
                      <span className="ms-detail-toggle-knob" />
                    </button>
                  </div>
                ) : null}

                {active.isGroup ? (
                  <div className="ms-detail-field">
                    <div className="ms-detail-section-head">
                      <label>
                        {ms.membersLabel}
                        {active.myRole
                          ? ` Â· ${ms.detailYou}: ${active.myRole === "ADMIN" ? ms.roleAdmin : ms.roleMember}`
                          : ""}
                      </label>
                      {active.myRole === "ADMIN" ? (
                        <button
                          type="button"
                          className="ms-detail-link"
                          onClick={() => setAddPeopleOpen(true)}
                        >
                          Add people
                        </button>
                      ) : null}
                    </div>
                    <div className="ms-member-list">
                      {active.members.map((member) => {
                        const isAdmin = member.role === "ADMIN";
                        const canManage = active.myRole === "ADMIN" && member.id !== myId;
                        const menuOpen = memberMenuOpen === member.id;
                        return (
                          <div key={member.id} className="ms-member-row">
                            <Av name={member.displayName} uid={member.id} avatarUrl={member.avatarUrl} size={32} />
                            <div className="ms-member-name-col">
                              <span className="ms-member-name">{member.displayName}</span>
                              <span className="ms-member-handle">@{member.username}</span>
                            </div>
                            {isAdmin && <span className="ms-member-badge">{ms.adminBadge}</span>}
                            {canManage ? (
                              <div className="ms-member-menu-wrap">
                                <button
                                  type="button"
                                  className="ms-member-menu-btn"
                                  aria-label="Member actions"
                                  onClick={() => setMemberMenuOpen(menuOpen ? null : member.id)}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                    <circle cx="5" cy="12" r="1.7" />
                                    <circle cx="12" cy="12" r="1.7" />
                                    <circle cx="19" cy="12" r="1.7" />
                                  </svg>
                                </button>
                                {menuOpen ? (
                                  <div className="ms-member-menu" role="menu">
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => {
                                        handleChangeMemberRole(member.id, isAdmin ? "MEMBER" : "ADMIN");
                                        setMemberMenuOpen(null);
                                      }}
                                    >
                                      {isAdmin ? ms.demote : ms.promote}
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="ms-member-menu-danger"
                                      onClick={() => handleRemoveMember(member.id)}
                                    >
                                      Remove from group
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <p className="ms-detail-section-label">Danger zone</p>

                {!active.isGroup && other ? (
                  <button
                    className="ms-detail-btn ms-detail-btn--danger"
                    onClick={handleBlockUser}
                    disabled={actionBusy !== null}
                  >
                    {actionBusy === "block" ? ms.blocking : ms.blockUserFmt(other.username)}
                  </button>
                ) : null}

                {active.isGroup ? (
                  <button
                    className="ms-detail-btn ms-detail-btn--danger"
                    onClick={handleLeaveGroup}
                    disabled={actionBusy !== null}
                  >
                    {actionBusy === "delete" ? ms.leaving : ms.leaveGroup}
                  </button>
                ) : (
                  <button
                    className="ms-detail-btn ms-detail-btn--danger"
                    onClick={handleDeleteChat}
                    disabled={actionBusy !== null}
                  >
                    {actionBusy === "delete" ? ms.deleting : ms.deleteChatBtn}
                  </button>
                )}

                {active.isGroup && addPeopleOpen ? (
                  <AddPeopleDialog
                    conversationId={activeId!}
                    existingMemberIds={active.members.map((m) => m.id)}
                    onClose={() => setAddPeopleOpen(false)}
                    onAdded={() => {
                      setAddPeopleOpen(false);
                      loadConvos();
                      showSuccess(language === "mn" ? "✓ Гишүүн нэмэгдлээ" : "✓ Members added");
                    }}
                  />
                ) : null}
              </aside>
            )}
          </>
        )}
      </main>

      {/* â”€â”€ COMPOSE MODAL â”€â”€ */}
      {compose && (
        <ComposeModal
          myId={myId}
          onClose={() => setCompose(false)}
          onCreated={id => { setCompose(false); loadConvos(); pick(id); }}
          onError={showError}
          ms={ms}
        />
      )}

      {notice && (
        <div className="ms-notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label={ms.noticeClose}>
            <IcX />
          </button>
        </div>
      )}

      {convoContext && (
        <>
          <div
            className="ms-convo-context-backdrop"
            aria-hidden
            onClick={() => setConvoContext(null)}
          />
          <div
            className="ms-convo-context-menu"
            role="menu"
            style={{ left: convoContext.x, top: convoContext.y }}
          >
            <button
              type="button"
              role="menuitem"
              className="ms-convo-context-item"
              onClick={() => markConvoUnreadFromMenu(convoContext.id)}
            >
              <Mail size={16} strokeWidth={1.8} aria-hidden />
              {ms.contextMarkUnread}
            </button>
            <button
              type="button"
              role="menuitem"
              className="ms-convo-context-item"
              onClick={() => toggleConvoPinnedToTop(convoContext.id)}
            >
              <Pin size={16} strokeWidth={1.8} aria-hidden />
              {prefs[convoContext.id]?.pinnedToTop ? ms.contextUnpin : ms.contextPin}
            </button>
            <button
              type="button"
              role="menuitem"
              className="ms-convo-context-item"
              onClick={() => toggleMuteFromContext(convoContext.id)}
            >
              <VolumeX size={16} strokeWidth={1.8} aria-hidden />
              {prefs[convoContext.id]?.muted ? ms.contextUnmute : ms.contextMute}
            </button>
            <button
              type="button"
              role="menuitem"
              className="ms-convo-context-item ms-convo-context-item--danger"
              onClick={() => void deleteConvoFromSidebar(convoContext.id)}
              disabled={actionBusy !== null}
            >
              <Trash2 size={16} strokeWidth={1.8} aria-hidden />
              {ms.contextDelete}
            </button>
          </div>
        </>
      )}

      <style>{`
        /* â”€â”€ shell â”€â”€ */
        /* First track: minmax(0, â€¦) so the column can shrink below 20rem when the shell is
           narrow (incognito / small window); plain clamp(20rem, â€¦) forced â‰¥20rem and caused
           horizontal overflow next to the fixed right rail. */
        .ms-root {
          display: grid;
          grid-template-columns: minmax(0, clamp(15rem, 26vw, 22rem)) minmax(0, 1fr);
          width: 100%; max-width: 100%; min-width: 0;
          height: 100%; min-height: 0; overflow: hidden; overflow-x: hidden;
          background: var(--app-background); --ms-bg: var(--app-background);
        }

        /* â”€â”€ sidebar â”€â”€ */
        .ms-side { display: flex; flex-direction: column; min-height: 0; min-width: 0; border-right: 1px solid var(--app-border); overflow: hidden; overflow-x: hidden; background: var(--app-card); }
        .ms-side--hide { display: none; }
        .ms-side-head { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.25rem .75rem; flex-shrink: 0; }
        .ms-side-title { font-size: 1.1rem; font-weight: 800; color: var(--text); margin: 0; letter-spacing: -.3px; }

        .ms-search-wrap { position: relative; margin: 0 1rem .75rem; flex-shrink: 0; }
        .ms-search-icon { position: absolute; left: .75rem; top: 50%; transform: translateY(-50%); color: var(--muted); display: flex; }
        .ms-search { width: 100%; padding: .55rem .75rem .55rem 2.25rem; background: var(--app-card-soft); border: 1px solid var(--app-border); border-radius: 10px; outline: none; font-size: .85rem; color: var(--text); box-sizing: border-box; transition: border-color .15s; }
        .ms-search:focus { border-color: var(--app-accent); }
        .ms-search::placeholder { color: var(--muted); }

        /* side tabs â€” underline style, pinned to bottom */
        .ms-side-tabs { display: flex; border-top: 1px solid var(--app-border); flex-shrink: 0; background: var(--app-card); margin-bottom: .7rem; }
        .ms-tabs-track { display: flex; width: 100%; }
        .ms-side-tab { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: .3rem; padding: .75rem .25rem; border: none; border-bottom: 2px solid transparent; background: transparent; font-size: .8rem; font-weight: 600; color: var(--muted); cursor: pointer; transition: color .15s, border-color .15s; white-space: nowrap; }
        .ms-side-tab:hover:not(.ms-side-tab--on) { color: var(--text); }
        .ms-side-tab--on { color: var(--text); border-bottom-color: var(--text); }
        .ms-req-badge { background: #ef4444; color: #fff; font-size: .56rem; font-weight: 800; min-width: 14px; height: 14px; border-radius: 999px; padding: 0 3px; display: inline-flex; align-items: center; justify-content: center; line-height: 1; }

        .ms-list { flex: 1; overflow-y: auto; padding: .25rem 0; }
        .ms-list::-webkit-scrollbar { width: 3px; }
        .ms-list::-webkit-scrollbar-thumb { background: var(--app-border); border-radius: 2px; }

        /* convo item */
        .ms-item { display: flex; align-items: stretch; width: 100%; padding: .75rem 0 .75rem 1.25rem; background: transparent; border: none; text-align: left; transition: background .15s; }
        .ms-item:hover { background: var(--app-card-soft); }
        .ms-item--on { background: rgba(var(--app-accent-rgb), .08); }
        .ms-item--on:hover { background: rgba(var(--app-accent-rgb), .12); }
        .ms-item-hit {
          flex: 1; min-width: 0; display: flex; align-items: center; gap: .875rem; padding: 0; margin: 0;
          background: transparent; border: none; cursor: pointer; text-align: left; font: inherit; color: inherit;
        }
        .ms-item-more {
          flex-shrink: 0; align-self: center; display: flex; align-items: center; justify-content: center;
          width: 2.25rem; height: 2.25rem; margin: 0 .35rem 0 0; padding: 0; border: none; border-radius: 8px;
          background: transparent; color: var(--muted); cursor: pointer; opacity: 0; transition: opacity .12s, background .12s, color .12s;
        }
        .ms-item:hover .ms-item-more,
        .ms-item-more:focus-visible { opacity: 1; }
        .ms-item-more:hover { background: var(--app-card-soft); color: var(--text); }
        .ms-item-more:focus-visible { outline: 2px solid var(--app-accent); outline-offset: 2px; }
        .ms-item-body { flex: 1; min-width: 0; }
        .ms-item-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: .2rem; }
        .ms-item-name { font-size: .88rem; font-weight: 700; color: var(--text); display: inline-flex; align-items: center; gap: .25rem; }
        .ms-item-pin-ico { flex-shrink: 0; opacity: .55; color: var(--muted); }
        .ms-item-time { font-size: .72rem; color: var(--muted); flex-shrink: 0; }
        .ms-item-bottom { display: flex; align-items: center; justify-content: space-between; }
        .ms-item-preview { font-size: .78rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
        .ms-item-preview--bold { font-weight: 600; color: var(--text); }
        .ms-unread { background: var(--app-accent); color: #fff; font-size: .65rem; font-weight: 800; min-width: 18px; height: 18px; border-radius: 9px; padding: 0 5px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-left: .5rem; }

        .ms-convo-context-backdrop { position: fixed; inset: 0; z-index: 1400; background: transparent; }
        .ms-convo-context-menu {
          position: fixed; z-index: 1410; min-width: 200px; max-width: min(92vw, 260px);
          background: var(--app-card); border: 1px solid var(--app-border); border-radius: 12px;
          box-shadow: 0 16px 40px rgba(0,0,0,.35); padding: .35rem; display: flex; flex-direction: column; gap: 2px;
        }
        .ms-convo-context-item {
          display: flex; align-items: center; gap: .6rem; width: 100%; padding: .55rem .75rem; border: none; border-radius: 8px;
          background: transparent; color: var(--text); font-size: .82rem; cursor: pointer; text-align: left;
        }
        .ms-convo-context-item:hover:not(:disabled) { background: var(--app-card-soft); }
        .ms-convo-context-item:disabled { opacity: .5; cursor: not-allowed; }
        .ms-convo-context-item--danger { color: #f87171; }
        .ms-convo-context-item--danger:hover:not(:disabled) { background: rgba(248,113,113,.12); }

        /* â”€â”€ main â”€â”€ */
        .ms-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; overflow-x: hidden; position: relative; }
        .ms-main--hide-mobile { display: none; }

        /* Per-conversation theme. Default â†’ fall back to the app accent. */
        .ms-main[data-conv-theme="default"] { --conv-accent: var(--app-accent); --conv-accent-2: var(--app-accent-secondary); }
        .ms-main[data-conv-theme="purple"]  { --conv-accent: #8b5cf6; --conv-accent-2: #6366f1; }
        .ms-main[data-conv-theme="pink"]    { --conv-accent: #ec4899; --conv-accent-2: #be185d; }
        .ms-main[data-conv-theme="blue"]    { --conv-accent: #3b82f6; --conv-accent-2: #1d4ed8; }
        .ms-main[data-conv-theme="green"]   { --conv-accent: #10b981; --conv-accent-2: #047857; }
        .ms-main[data-conv-theme="amber"]   { --conv-accent: #f59e0b; --conv-accent-2: #d97706; }
        .ms-main[data-conv-theme="violet"]  { --conv-accent: #a855f7; --conv-accent-2: #7e22ce; }
        .ms-main[data-conv-theme="rose"]    { --conv-accent: #f43f5e; --conv-accent-2: #be123c; }

        /* Apply theme accent to outgoing bubbles + emphasised chrome.
           Bubble class is .ms-bubble--me (not --mine). Earlier selector
           pointed at a non-existent class, so themes silently did nothing.
           Selector includes [data-conv-theme] + :not(default) so it beats
           the later .ms-bubble--me background rule via specificity. */
        .ms-main[data-conv-theme]:not([data-conv-theme="default"]) .ms-bubble--me {
          background: linear-gradient(135deg, var(--conv-accent), var(--conv-accent-2));
        }
        .ms-main .ms-icon-btn--on { color: var(--conv-accent); }

        /* Theme picker swatches (in detail panel). */
        .ms-theme-swatches {
          display: grid;
          grid-template-columns: repeat(8, 1fr);
          gap: .5rem;
          margin-top: .35rem;
        }
        .ms-theme-swatch {
          aspect-ratio: 1;
          border-radius: 50%;
          border: 2px solid var(--app-border);
          cursor: pointer;
          padding: 0;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.12s ease, border-color 0.12s ease;
        }
        .ms-theme-swatch:hover { transform: scale(1.08); }
        .ms-theme-swatch--on { border-color: var(--app-text); transform: scale(1.05); }
        .ms-theme-swatch svg { width: 60%; height: 60%; }
        @media (max-width: 640px) {
          .ms-theme-swatches { grid-template-columns: repeat(4, 1fr); }
        }

        /* header */
        .ms-head { display: flex; align-items: center; gap: .875rem; padding: .875rem 1.25rem; border-bottom: 1px solid var(--app-border); background: var(--app-card); flex-shrink: 0; min-width: 0; }
        .ms-back { margin-left: -.25rem; }
        .ms-head-profile-link {
          display: flex;
          align-items: center;
          gap: .875rem;
          flex: 1;
          min-width: 0;
          text-decoration: none;
          color: inherit;
          border-radius: 10px;
          margin: -.15rem -.3rem;
          padding: .15rem .3rem;
        }
        .ms-head-profile-link:hover { background: var(--app-card-soft, rgba(255,255,255,.05)); }
        .ms-head-profile-link:focus-visible { outline: 2px solid var(--app-accent, #6366f1); outline-offset: 2px; }
        .ms-head-info { flex: 1; min-width: 0; }
        .ms-head-name { display: block; font-size: .9rem; font-weight: 700; color: var(--text); }
        .ms-head-sub  { display: block; font-size: .75rem; color: var(--muted); }
        .ms-head-actions { display: flex; flex-wrap: wrap; gap: .25rem; justify-content: flex-end; min-width: 0; max-width: 100%; }

        .ms-detail {
          position: absolute;
          top: 4.1rem;
          right: 1rem;
          width: min(92vw, 320px);
          border: 1px solid var(--app-border);
          background: var(--app-card);
          border-radius: 14px;
          box-shadow: 0 18px 36px rgba(0,0,0,.28);
          padding: .75rem;
          display: flex;
          flex-direction: column;
          gap: .55rem;
          z-index: 8;
        }
        .ms-detail-head { display: flex; align-items: center; justify-content: space-between; }
        .ms-detail-head span { font-size: .83rem; font-weight: 800; color: var(--text); }
        .ms-detail-field { display: flex; flex-direction: column; gap: .35rem; }
        .ms-detail-field label { font-size: .72rem; color: var(--muted); font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
        .ms-detail-row { display: flex; gap: .45rem; }
        .ms-detail-row input {
          flex: 1;
          min-width: 0;
          border: 1px solid var(--app-border);
          background: var(--app-background);
          color: var(--text);
          border-radius: 9px;
          padding: .5rem .6rem;
          font-size: .82rem;
          outline: none;
        }
        .ms-detail-row button {
          border: none;
          border-radius: 9px;
          background: var(--app-accent);
          color: #fff;
          font-size: .78rem;
          font-weight: 700;
          padding: 0 .8rem;
          cursor: pointer;
        }
        .ms-detail-btn {
          border: 1px solid var(--app-border);
          border-radius: 10px;
          background: var(--app-background);
          color: var(--text);
          font-size: .82rem;
          font-weight: 700;
          padding: .58rem .7rem;
          text-align: left;
          cursor: pointer;
        }
        .ms-detail-btn--on {
          border-color: var(--app-accent);
          color: var(--app-accent);
          background: rgba(var(--app-accent-rgb), .08);
        }
        .ms-detail-btn--danger {
          color: #ef4444;
          border-color: rgba(239,68,68,.25);
          background: rgba(239,68,68,.08);
        }
        .ms-detail-btn:disabled {
          opacity: .6;
          cursor: not-allowed;
        }

        .ms-detail-hero {
          display: flex;
          align-items: center;
          gap: .85rem;
          padding: 1.1rem .9rem;
          margin-bottom: .35rem;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(var(--app-accent-rgb), .07), rgba(var(--app-accent-rgb), .12));
          border: 1px solid var(--app-border);
        }
        .ms-detail-hero-stack {
          position: relative;
          width: 76px;
          height: 52px;
          flex-shrink: 0;
        }
        .ms-detail-hero-stack-av {
          position: absolute;
          top: 0;
          border-radius: 50%;
          overflow: hidden;
          box-shadow: 0 0 0 2px var(--app-card);
        }
        .ms-detail-hero-stack-av--0 { left: 0; z-index: 3; }
        .ms-detail-hero-stack-av--1 { left: 18px; top: 6px; z-index: 2; opacity: .96; }
        .ms-detail-hero-stack-av--2 { left: 34px; top: 0; z-index: 1; opacity: .92; }
        .ms-detail-hero-text { flex: 1; min-width: 0; }
        .ms-detail-hero-title {
          margin: 0;
          font-size: 1rem;
          font-weight: 800;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ms-detail-hero-sub { margin: .15rem 0 0; color: var(--muted); font-size: .82rem; }
        .ms-detail-hero-link {
          display: inline-block;
          margin-top: .35rem;
          font-size: .8rem;
          font-weight: 700;
          color: var(--app-accent);
          text-decoration: none;
        }
        .ms-detail-hero-link:hover { text-decoration: underline; }

        .ms-detail-section-label {
          margin: .8rem .35rem .3rem;
          font-size: .68rem;
          font-weight: 700;
          letter-spacing: .06em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .ms-detail-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: .55rem .35rem;
          gap: .75rem;
        }
        .ms-detail-toggle-label {
          font-size: .88rem;
          font-weight: 600;
          color: var(--text);
        }
        .ms-detail-toggle {
          width: 40px;
          height: 22px;
          border-radius: 999px;
          background: var(--app-background);
          border: 1px solid var(--app-border);
          position: relative;
          cursor: pointer;
          padding: 0;
          transition: background 160ms ease, border-color 160ms ease;
        }
        .ms-detail-toggle-knob {
          position: absolute;
          top: 50%;
          left: 2px;
          transform: translateY(-50%);
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--muted);
          transition: left 160ms ease, background 160ms ease;
        }
        .ms-detail-toggle--on {
          background: var(--app-accent);
          border-color: var(--app-accent);
        }
        .ms-detail-toggle--on .ms-detail-toggle-knob {
          left: calc(100% - 18px);
          background: #fff;
        }

        .ms-detail-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: .75rem;
        }
        .ms-detail-link {
          background: none;
          border: none;
          padding: 0;
          color: var(--app-accent);
          font: inherit;
          font-weight: 700;
          font-size: .82rem;
          cursor: pointer;
        }
        .ms-detail-link:hover { text-decoration: underline; }

        .ms-member-menu-wrap { position: relative; }
        .ms-member-menu-btn {
          background: none;
          border: none;
          padding: .25rem;
          color: var(--muted);
          cursor: pointer;
          border-radius: 6px;
        }
        .ms-member-menu-btn:hover { background: var(--app-background); color: var(--text); }
        .ms-member-menu {
          position: absolute;
          right: 0;
          top: calc(100% + 4px);
          min-width: 180px;
          background: var(--app-card);
          border: 1px solid var(--app-border);
          border-radius: 10px;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);
          z-index: 20;
          padding: .25rem;
          display: flex;
          flex-direction: column;
        }
        .ms-member-menu button {
          background: none;
          border: none;
          padding: .55rem .75rem;
          text-align: left;
          font: inherit;
          color: var(--text);
          border-radius: 6px;
          cursor: pointer;
        }
        .ms-member-menu button:hover { background: var(--app-background); }
        .ms-member-menu-danger { color: #ef4444 !important; }
        .ms-member-menu-danger:hover { background: rgba(239, 68, 68, 0.08) !important; }

        .ms-modal--add-people { max-width: 480px; }
        .ms-modal-chips-label {
          width: 100%;
          font-size: .7rem;
          font-weight: 700;
          color: var(--muted);
          letter-spacing: .04em;
          text-transform: uppercase;
          margin-bottom: .15rem;
        }
        .ms-modal-hint {
          margin: 0 1.25rem .25rem;
          padding: .55rem .7rem;
          border-radius: 10px;
          background: rgba(var(--app-accent-rgb), .07);
          color: var(--muted);
          font-size: .78rem;
          font-weight: 500;
        }

        /* request banner */
        .ms-req-banner { display: flex; align-items: center; justify-content: space-between; padding: .65rem 1.25rem; background: rgba(var(--app-accent-rgb),.07); border-bottom: 1px solid var(--app-border); font-size: .82rem; color: var(--muted); flex-shrink: 0; gap: 1rem; }
        .ms-req-banner--block { background: rgba(239, 68, 68, .08); color: var(--text); }
        .ms-req-accept { padding: .35rem .9rem; border-radius: 8px; border: none; background: var(--app-accent); color: #fff; font-size: .8rem; font-weight: 700; cursor: pointer; flex-shrink: 0; }

        /* feed */
        .ms-feed { flex: 1; min-width: 0; overflow-y: auto; overflow-x: hidden; padding: 1.25rem 1.25rem 0; display: flex; flex-direction: column; gap: .2rem; }
        .ms-feed::-webkit-scrollbar { width: 4px; }
        .ms-feed::-webkit-scrollbar-thumb { background: var(--app-border); border-radius: 2px; }
        .ms-date-chip { text-align: center; font-size: .72rem; font-weight: 600; color: var(--muted); letter-spacing: .04em; margin: .75rem 0; text-transform: uppercase; }
        .ms-convo-start { display: flex; flex-direction: column; align-items: center; gap: .5rem; padding: 2.5rem 1rem; text-align: center; }
        .ms-convo-name { font-size: 1rem; font-weight: 800; color: var(--text); margin: .25rem 0 0; }
        .ms-convo-hint { font-size: .8rem; color: var(--muted); margin: 0; }

        /* bubbles */
        .ms-row { display: flex; align-items: flex-end; gap: .5rem; margin-bottom: .15rem; max-width: 100%; min-width: 0; }
        .ms-row--me { flex-direction: row-reverse; }
        .ms-row-av { width: 28px; flex-shrink: 0; display: flex; align-items: flex-end; }
        .ms-pinned-bar {
          position: sticky;
          top: 0;
          z-index: 5;
          width: min(100%, 460px);
          margin: 0 auto .55rem;
          display: inline-flex;
          align-items: center;
          gap: .45rem;
          padding: .4rem .55rem;
          border-radius: 10px;
          border: 1px solid var(--app-border);
          background: rgba(17, 24, 39, .86);
          color: #e5e7eb;
          cursor: pointer;
        }
        .ms-pinned-icon { display: inline-flex; color: #cbd5e1; }
        .ms-pinned-text { font-size: .78rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ms-bubble-wrap {
          position: relative; display: flex; flex-direction: column; gap: .15rem;
          min-width: 0;
          max-width: min(74%, calc(100% - 2.5rem));
        }
        .ms-bubble { max-width: 100%; min-width: 0; padding: .55rem .875rem .35rem; border-radius: 18px; display: flex; flex-direction: column; gap: .25rem; line-height: 1.45; word-break: break-word; }
        .ms-bubble--me { align-self: flex-end; }
        .ms-bubble--them { align-self: flex-start; }
        .ms-bubble--them { background: var(--app-card); border: 1px solid var(--app-border); border-bottom-left-radius: 5px; }
        .ms-row--highlight .ms-bubble { box-shadow: 0 0 0 2px var(--app-accent); animation: ms-row-pulse 1.6s ease-out 1; }
        @keyframes ms-row-pulse { 0% { background-color: rgba(99,102,241,.18); } 100% { background-color: transparent; } }
        .ms-icon-btn--on { color: var(--app-accent); }
        .ms-search-panel { border-bottom: 1px solid var(--app-border); background: var(--app-card); padding: .75rem 1.25rem; display: flex; flex-direction: column; gap: .5rem; flex-shrink: 0; }
        .ms-search-row { display: flex; align-items: center; gap: .55rem; background: var(--app-background); border: 1.5px solid var(--app-border); border-radius: 18px; padding: .4rem .75rem; }
        .ms-search-row:focus-within { border-color: var(--app-accent); }
        .ms-search-icon { color: var(--muted); display: inline-flex; }
        .ms-search-input { flex: 1; background: transparent; border: none; outline: none; font-size: .85rem; color: var(--text); font-family: inherit; }
        .ms-search-input::placeholder { color: var(--muted); }
        .ms-search-clear { background: transparent; border: none; cursor: pointer; color: var(--muted); display: inline-flex; padding: .15rem; }
        .ms-search-clear:hover { color: var(--text); }
        .ms-search-status { font-size: .78rem; color: var(--muted); padding: .25rem .15rem; }
        .ms-search-results { display: flex; flex-direction: column; gap: .25rem; max-height: 280px; overflow-y: auto; padding-right: .15rem; }
        .ms-search-result { display: flex; align-items: flex-start; gap: .65rem; padding: .55rem .65rem; background: transparent; border: 1px solid transparent; border-radius: 12px; text-align: left; cursor: pointer; transition: background .12s, border-color .12s; }
        .ms-search-result:hover { background: var(--app-background); border-color: var(--app-border); }
        .ms-search-result-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .15rem; }
        .ms-search-result-head { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; }
        .ms-search-result-name { font-size: .8rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ms-search-result-time { font-size: .65rem; color: var(--muted); flex-shrink: 0; }
        .ms-search-result-snippet { font-size: .75rem; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .ms-voice-strip { flex: 1; display: flex; align-items: center; gap: .55rem; min-height: 36px; padding: 0 .25rem; }
        .ms-voice-rec-dot { width: 9px; height: 9px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 0 0 rgba(239,68,68,.7); animation: ms-voice-pulse 1.2s infinite; flex-shrink: 0; }
        @keyframes ms-voice-pulse { 0% { box-shadow: 0 0 0 0 rgba(239,68,68,.5); } 70% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } }
        .ms-voice-time { font-size: .78rem; color: var(--muted); font-variant-numeric: tabular-nums; flex-shrink: 0; min-width: 36px; }
        .ms-voice-wave { flex: 1; min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 2px; height: 28px; }
        .ms-voice-wave--preview { opacity: .8; }
        .ms-voice-bar { display: inline-block; width: 3px; min-height: 4px; background: var(--app-accent); border-radius: 2px; transition: height .12s; }
        .ms-voice-wave .ms-voice-bar { flex-shrink: 1; min-width: 1px; }
        .ms-voice-preview-audio { display: none; }
        .ms-compose-mic { background: transparent !important; color: var(--muted) !important; border: none; }
        .ms-compose-mic:hover { color: var(--text) !important; }
        .ms-compose-mic--cancel { color: #ef4444 !important; }
        /* Cap width but allow shrinking in narrow columns; track uses min-width:0 so bars donâ€™t get clipped by overflow-x:hidden. */
        .ms-voice-player { display: flex; align-items: center; gap: .55rem; min-width: 0; align-self: flex-start; width: 100%; max-width: 260px; padding: .25rem 0; box-sizing: border-box; }
        .ms-voice-player .ms-voice-bar { flex-shrink: 1; min-width: 1px; }
        .ms-voice-player--me .ms-voice-bar { background: rgba(255,255,255,.55); }
        .ms-voice-player--me .ms-voice-bar--on { background: #fff; }
        .ms-voice-player--them .ms-voice-bar { background: var(--app-border); }
        .ms-voice-player--them .ms-voice-bar--on { background: var(--app-accent); }
        .ms-voice-play { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; border: none; background: rgba(0,0,0,.08); color: inherit; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
        .ms-voice-player--me .ms-voice-play { background: rgba(255,255,255,.22); color: #fff; }
        .ms-voice-track { flex: 1; min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 2px; height: 28px; cursor: pointer; }
        .ms-voice-player-time { font-size: .68rem; color: var(--muted); font-variant-numeric: tabular-nums; flex-shrink: 0; }
        .ms-voice-player--me .ms-voice-player-time { color: rgba(255,255,255,.7); }
        .ms-member-list { display: flex; flex-direction: column; gap: .35rem; }
        .ms-member-row { display: flex; align-items: center; gap: .55rem; padding: .35rem .5rem; border: 1px solid transparent; border-radius: 10px; }
        .ms-member-row:hover { background: var(--app-background); border-color: var(--app-border); }
        .ms-member-name-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .ms-member-name { font-size: .82rem; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ms-member-handle { font-size: .68rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ms-member-badge { font-size: .62rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--app-accent); border: 1px solid var(--app-accent); padding: .1rem .4rem; border-radius: 999px; flex-shrink: 0; }
        .ms-member-role-btn { font-size: .7rem; font-weight: 600; color: var(--text); background: transparent; border: 1px solid var(--app-border); padding: .25rem .55rem; border-radius: 999px; cursor: pointer; flex-shrink: 0; transition: background .12s, border-color .12s; }
        .ms-member-role-btn:hover { background: var(--app-background); border-color: var(--app-accent); color: var(--app-accent); }
        .ms-typing-row { display: flex; align-items: center; gap: .5rem; padding: .25rem 0 .5rem; }
        .ms-typing-bubble { background: var(--app-card); border: 1px solid var(--app-border); border-radius: 18px; border-bottom-left-radius: 5px; padding: .55rem .75rem; display: inline-flex; align-items: center; gap: 4px; }
        .ms-typing-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); display: inline-block; animation: ms-typing-bounce 1.2s infinite ease-in-out; }
        .ms-typing-dot:nth-child(2) { animation-delay: .15s; }
        .ms-typing-dot:nth-child(3) { animation-delay: .3s; }
        .ms-typing-label { font-size: .72rem; color: var(--muted); }
        @keyframes ms-typing-bounce { 0%, 80%, 100% { transform: translateY(0); opacity: .4; } 40% { transform: translateY(-3px); opacity: 1; } }
        .ms-bubble--me { background: var(--mc, var(--app-accent)); border-bottom-right-radius: 5px; }
        .ms-bubble-text { font-size: .88rem; color: var(--text); white-space: pre-wrap; word-break: break-word; }
        .ms-bubble--me .ms-bubble-text { color: #fff; }
        .ms-bubble-time { font-size: .62rem; color: var(--muted); flex-shrink: 0; align-self: flex-end; line-height: 1; margin-top: .15rem; opacity: .75; }
        .ms-bubble--me .ms-bubble-time { color: rgba(255,255,255,.6); }
        .ms-bubble-media-wrap { width: 100%; border-radius: 12px; overflow: hidden; background: transparent; }
        .ms-bubble-media { display: block; width: min(300px, 100%); max-width: 100%; max-height: 320px; object-fit: cover; border-radius: 12px; }
        .ms-bubble--media-only { padding: 0; background: transparent !important; border: none !important; border-radius: 0 !important; max-width: min(320px, 74%); display: block; }
        .ms-bubble--media-only .ms-bubble-time { display: block; margin-top: .3rem; color: var(--muted); }
        .ms-bubble--me.ms-bubble--media-only .ms-bubble-time { text-align: right; }
        .ms-bubble--them.ms-bubble--media-only .ms-bubble-time { text-align: left; }
        .ms-reply-label {
          display: flex;
          flex-direction: column;
          gap: .15rem;
          padding: 0 .3rem .15rem;
          max-width: 80%;
          margin-bottom: -.15rem;
        }
        .ms-reply-label--me { align-self: flex-end; align-items: flex-end; text-align: right; }
        .ms-reply-label--them { align-self: flex-start; align-items: flex-start; }
        .ms-reply-label-line { font-size: .68rem; color: var(--muted); font-weight: 500; line-height: 1.2; }
        .ms-reply-label-preview {
          font-size: .72rem;
          color: var(--muted);
          opacity: .7;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          padding: .35rem .7rem;
          border-radius: 14px;
          background: var(--app-card-soft);
          border: 1px solid var(--app-border);
          line-height: 1.3;
        }
        .ms-bubble-actions {
          position: absolute;
          top: -30px;
          right: 0;
          display: inline-flex;
          align-items: center;
          gap: .2rem;
          padding: .2rem;
          border-radius: 999px;
          background: rgba(15, 23, 42, .92);
          border: 1px solid rgba(255,255,255,.14);
          opacity: 0;
          pointer-events: none;
          transform: translateY(6px);
          transition: opacity .14s ease, transform .14s ease;
          z-index: 3;
        }
        .ms-bubble-wrap:hover .ms-bubble-actions,
        .ms-bubble-wrap:focus-within .ms-bubble-actions {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }
        .ms-bubble-action-btn {
          width: 26px;
          height: 26px;
          border: none;
          border-radius: 999px;
          background: transparent;
          color: #e2e8f0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .ms-bubble-action-btn:hover { background: rgba(148, 163, 184, .2); color: #fff; }
        .ms-more-menu {
          position: absolute;
          top: -6px;
          right: 84px;
          min-width: 150px;
          background: rgba(31, 41, 55, .98);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 12px;
          padding: .3rem;
          box-shadow: 0 14px 34px rgba(0,0,0,.45);
          z-index: 6;
        }
        .ms-more-menu-time {
          color: #9ca3af;
          font-size: .68rem;
          font-weight: 600;
          padding: .35rem .5rem;
        }
        .ms-more-menu-item {
          width: 100%;
          border: none;
          background: transparent;
          color: #e5e7eb;
          display: flex;
          align-items: center;
          justify-content: space-between;
          text-align: left;
          font-size: .8rem;
          border-radius: 8px;
          padding: .4rem .5rem;
          cursor: pointer;
        }
        .ms-more-menu-item:hover { background: rgba(255,255,255,.08); }
        .ms-more-menu-item--danger { color: #f87171; }
        .ms-reaction-picker {
          display: inline-flex;
          align-items: center;
          gap: .25rem;
          background: var(--app-card);
          border: 1px solid var(--app-border);
          border-radius: 999px;
          padding: .25rem;
          width: fit-content;
          box-shadow: 0 8px 18px rgba(0,0,0,.2);
        }
        .ms-reaction-picker-btn {
          width: 28px;
          height: 28px;
          border: none;
          border-radius: 999px;
          background: transparent;
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
        }
        .ms-reaction-picker-btn:hover { background: var(--app-card-soft); }
        .ms-reaction-strip { display: inline-flex; align-items: center; gap: .3rem; }
        .ms-reaction-chip {
          display: inline-flex;
          align-items: center;
          gap: .2rem;
          padding: .15rem .45rem;
          border-radius: 999px;
          border: 1px solid var(--app-border);
          background: var(--app-card);
          color: var(--text);
          font-size: .72rem;
          font-weight: 700;
        }

        /* composer */
        .ms-compose { display: flex; align-items: flex-end; gap: .6rem; padding: .875rem 1.25rem; border-top: 1px solid var(--app-border); background: var(--app-card); flex-shrink: 0; min-width: 0; max-width: 100%; overflow-x: hidden; }
        .ms-compose-box { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: flex-end; background: var(--app-background); border: 1.5px solid var(--app-border); border-radius: 22px; padding: .4rem .4rem .4rem .75rem; gap: .3rem; transition: border-color .15s; }
        .ms-compose-box:focus-within { border-color: var(--app-accent); }
        .ms-compose-emoji { background: transparent; border: none; cursor: pointer; color: var(--muted); display: flex; padding: .25rem; flex-shrink: 0; transition: color .15s; }
        .ms-compose-emoji:hover { color: var(--text); }
        .ms-compose-ta { flex: 1; min-width: 0; background: transparent; border: none; outline: none; resize: none; font-size: .9rem; color: var(--text); font-family: inherit; line-height: 1.5; padding: .25rem 0; max-height: 120px; overflow-y: auto; }
        .ms-compose-ta::placeholder { color: var(--muted); }
        .ms-compose-ta:disabled { opacity: .5; }
        .ms-compose-send { width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0; background: var(--mc, var(--app-accent)); border: none; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform .15s, filter .15s; }
        .ms-compose-send:hover { transform: scale(1.08); filter: brightness(1.1); }
        .ms-compose-send:disabled { opacity: .5; cursor: not-allowed; }

        /* shared icon btn */
        .ms-icon-btn { width: 36px; height: 36px; border-radius: 10px; background: transparent; border: none; color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s, color .15s; flex-shrink: 0; }
        .ms-icon-btn:hover { background: var(--app-card-soft); color: var(--text); }
        .ms-compose-btn { width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; background: var(--app-card-soft); border: 1px solid var(--app-border); color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: border-color .15s, color .15s; }
        .ms-compose-btn:hover { border-color: var(--app-accent); color: var(--app-accent); }
        .ms-compose-attachment { position: relative; width: 48px; height: 48px; flex-shrink: 0; border-radius: 10px; overflow: hidden; }
        .ms-compose-attachment-media { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ms-compose-attachment-remove { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border: none; border-radius: 999px; background: rgba(0,0,0,.6); color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
        .ms-reply-draft {
          order: -1;
          flex-basis: 100%;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: .5rem;
          padding: .35rem .5rem;
          border-radius: 10px;
          border: 1px solid var(--app-border);
          background: var(--app-card-soft);
          margin-bottom: .2rem;
        }
        .ms-reply-draft-text { display: flex; flex-direction: column; min-width: 0; }
        .ms-reply-draft-text span { font-size: .68rem; font-weight: 700; color: var(--text); }
        .ms-reply-draft-text small { font-size: .66rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ms-reply-draft-close {
          width: 22px;
          height: 22px;
          border: none;
          border-radius: 999px;
          background: rgba(148,163,184,.22);
          color: var(--text);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }

        /* empty / hints */
        .ms-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 1rem; padding: 2rem; }
        .ms-empty-ring { width: 72px; height: 72px; border-radius: 50%; background: var(--app-card-soft); border: 1.5px solid var(--app-border); display: flex; align-items: center; justify-content: center; color: var(--muted); }
        .ms-empty-title { font-size: 1rem; font-weight: 700; color: var(--text); margin: 0; }
        .ms-empty-sub { font-size: .85rem; color: var(--muted); margin: 0; text-align: center; }
        .ms-hint { padding: 1.25rem; font-size: .83rem; color: var(--muted); }
        .ms-hint--center { text-align: center; }

        /* â”€â”€ compose modal â”€â”€ */
        .ms-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .ms-modal { background: var(--app-card); border: 1px solid var(--app-border); border-radius: 16px; width: 100%; max-width: 420px; max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
        .ms-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid var(--app-border); flex-shrink: 0; }
        .ms-modal-title { font-size: .95rem; font-weight: 800; color: var(--text); }

        .ms-modal-tabs { display: flex; gap: .25rem; padding: .75rem 1.25rem .25rem; flex-shrink: 0; }
        .ms-modal-tab { flex: 1; padding: .4rem; border-radius: 8px; border: none; background: transparent; font-size: .82rem; font-weight: 600; color: var(--muted); cursor: pointer; transition: all .15s; }
        .ms-modal-tab--on { background: rgba(var(--app-accent-rgb),.1); color: var(--app-accent); }

        .ms-modal-field { padding: .5rem 1.25rem; flex-shrink: 0; }
        .ms-modal-input { width: 100%; padding: .6rem .875rem; background: var(--app-background); border: 1.5px solid var(--app-border); border-radius: 10px; outline: none; font-size: .88rem; color: var(--text); font-family: inherit; box-sizing: border-box; transition: border-color .15s; }
        .ms-modal-input:focus { border-color: var(--app-accent); }
        .ms-modal-input::placeholder { color: var(--muted); }
        .ms-modal-error { margin: .15rem 1.25rem .25rem; padding: .5rem .65rem; border-radius: 8px; background: rgba(239,68,68,.12); color: #ef4444; font-size: .78rem; font-weight: 650; }

        .ms-modal-chips { display: flex; flex-wrap: wrap; gap: .35rem; padding: .25rem 1.25rem; flex-shrink: 0; }
        .ms-chip { display: inline-flex; align-items: center; gap: .3rem; padding: .25rem .6rem; background: rgba(var(--app-accent-rgb),.12); color: var(--app-accent); border-radius: 999px; font-size: .78rem; font-weight: 600; }
        .ms-chip button { background: none; border: none; cursor: pointer; color: var(--app-accent); font-size: .9rem; line-height: 1; padding: 0; display: flex; }

        .ms-modal-results { flex: 1; overflow-y: auto; padding: .5rem 0; }
        .ms-modal-empty { font-size: .83rem; color: var(--muted); text-align: center; padding: 1.5rem; margin: 0; }
        .ms-modal-user { display: flex; align-items: center; gap: .75rem; width: 100%; padding: .65rem 1.25rem; background: transparent; border: none; cursor: pointer; text-align: left; transition: background .15s; }
        .ms-modal-user:hover { background: var(--app-card-soft); }
        .ms-modal-user:disabled { opacity: .6; cursor: not-allowed; }
        .ms-modal-user--sel { background: rgba(var(--app-accent-rgb),.06); }
        .ms-modal-uinfo { flex: 1; min-width: 0; }
        .ms-modal-uname { display: block; font-size: .88rem; font-weight: 700; color: var(--text); }
        .ms-modal-usub { display: block; font-size: .75rem; color: var(--muted); }
        .ms-modal-check { color: var(--app-accent); font-weight: 800; font-size: 1rem; }

        .ms-modal-foot { padding: .875rem 1.25rem; border-top: 1px solid var(--app-border); flex-shrink: 0; }
        .ms-modal-create { width: 100%; padding: .6rem; border-radius: 10px; border: none; background: var(--app-accent); color: #fff; font-size: .875rem; font-weight: 700; cursor: pointer; transition: filter .15s; }
        .ms-modal-create:disabled { opacity: .5; cursor: not-allowed; }
        .ms-modal-create:not(:disabled):hover { filter: brightness(1.08); }

        .ms-notice { position: fixed; left: 50%; bottom: 1.25rem; z-index: 240; transform: translateX(-50%); max-width: min(92vw, 460px); display: inline-flex; align-items: center; gap: .75rem; padding: .72rem .85rem .72rem 1rem; border-radius: 12px; background: #dc2626; color: #fff; box-shadow: 0 12px 34px rgba(0,0,0,.34); font-size: .84rem; font-weight: 700; }
        .ms-notice button { width: 28px; height: 28px; border: none; border-radius: 50%; background: rgba(255,255,255,.16); color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }

        /* responsive — breakpoint matches AppShell (768px) so the mobile
           sidebar↔chat swap aligns with the bottom-tabs cutoff. */
        @media (max-width: 768px) {
          .ms-root {
            grid-template-columns: 1fr;
            /* Make room for the mobile top bar (3.2rem) and bottom tabs
               (3.6rem + iOS safe area). Without this the chat header
               disappears under the Linksy/bell bar and the compose box
               hides behind the tab bar. */
            padding-top: 3.2rem;
            padding-bottom: calc(3.6rem + env(safe-area-inset-bottom, 0px));
            min-height: 100svh;
          }
          .ms-side--hide { display: none; }
          .ms-main--hide-mobile { display: none; }
          .ms-main { display: flex; }
          /* Compose strip stays glued to the bottom of the chat above the
             tab bar instead of floating mid-screen. */
          .ms-compose {
            position: sticky;
            bottom: 0;
            background: var(--app-card-elevated, var(--app-card));
          }
        }
        @media (min-width: 769px) {
          .ms-side { display: flex !important; }
          .ms-main { display: flex !important; }
          .ms-back { display: none; }
        }

        /* ── Phone refinements (≤480px) ────────────────────────────────────
           The 767px breakpoint above only handles the sidebar/main swap.
           Pin compose textarea to 16px to suppress iOS focus-zoom, tighten
           paddings so each bubble has room to breathe on a 360-380px viewport,
           and cap bubble max-width so a "row--me" alignment is still
           readable next to the 28px avatar gutter. */
        @media (max-width: 480px) {
          .ms-feed { padding: 0.85rem 0.85rem 0; }
          .ms-head { padding: 0.75rem 0.85rem; gap: 0.6rem; }
          .ms-head-name { font-size: 0.88rem; }
          .ms-head-sub { font-size: 0.72rem; }
          .ms-item { padding: 0.65rem 0 0.65rem 0.85rem; }
          .ms-bubble { max-width: 88%; }
          .ms-compose { padding: 0.7rem 0.85rem; gap: 0.45rem; }
          .ms-compose-box { padding: 0.4rem 0.4rem 0.4rem 0.65rem; gap: 0.25rem; }
          .ms-compose-ta {
            /* iOS auto-zooms when input font is <16px; pin here. */
            font-size: 16px;
          }
        }

        /* Touch-device tap targets — WCAG 2.5.5. The icon buttons are 36×36,
           compose buttons 38×38, bubble actions 26×26 — all below the 44×44
           recommended minimum on coarse pointers. Override here without
           inflating the desktop sidebar density. */
        @media (pointer: coarse) {
          .ms-icon-btn { width: 44px; height: 44px; }
          .ms-compose-btn { width: 44px; height: 44px; }
          .ms-compose-emoji { padding: 0.55rem; }
          .ms-bubble-action-btn { min-width: 32px; min-height: 32px; }
          .ms-item { padding-block: 0.85rem; }
        }

        /* Disable the bubble highlight pulse + hover transitions for users
           with prefers-reduced-motion. */
        @media (prefers-reduced-motion: reduce) {
          .ms-row--highlight .ms-bubble { animation: none !important; }
          .ms-item,
          .ms-icon-btn,
          .ms-compose-box,
          .ms-bubble-action-btn {
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
