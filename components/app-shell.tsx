"use client";

import { CreateModal, CreateDropdown } from "@/components/create-modal";
import { CurrentUserAvatar } from "@/components/current-user-avatar";
import { IncomingCallListener } from "@/components/incoming-call-listener";
import { useLanguagePreferences } from "@/components/language-provider";
import { SearchDrawerCard } from "@/components/search-drawer-card";
import { ThemeSettingsCard } from "@/components/theme-settings-card";
import {
  feedChromeStrings,
  shellNavLabel,
  shellNotifTimeShort,
  shellNotifUi,
  shellNotifVerb,
} from "@/lib/i18n/global-ui-strings";
import type { AppLanguage } from "@/lib/language";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type CSSProperties, type ReactNode, useCallback, useState, useEffect, useMemo, useRef } from "react";
import { AVATAR_PLACEHOLDER_GRADIENT } from "@/lib/avatar-placeholder";
import { displayMediaSrc } from "@/lib/media";
import {
  APP_SHELL_LEFT_KEYS,
  APP_SHELL_RIGHT_KEYS,
  CHROME_SHELL_NAV_ITEMS,
  shellNavPathActive,
} from "@/lib/shell-nav-items";
import { userProfileHref } from "@/lib/user-url";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { NavBtn } from "@/components/ui/nav-btn";
import Image from "next/image";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";

function G({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

import { useNotificationsStore, type ShellNotif } from "@/lib/stores/notifications";
import { useAiAgentBridge } from "@/lib/stores/ai-agent-bridge";
import { useMessagesUnreadStore } from "@/lib/stores/messages-unread";

function ShellNotifDropdown({
  anchorEl, notifs, unreadCount, onClose, onMarkAllRead, onOpenNotif, language,
}: {
  anchorEl: HTMLElement | null;
  notifs: ShellNotif[];
  unreadCount: number;
  onClose: () => void;
  onMarkAllRead: () => void;
  onOpenNotif: (notif: ShellNotif) => void;
  language: AppLanguage;
}) {
  const notifCopy = shellNotifUi(language);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: "hidden" });
  useFocusTrap(Boolean(anchorEl), ref);

  useEffect(() => {
    if (!anchorEl) return;
    const navEl = anchorEl.closest(".feed-sidenav") as HTMLElement | null;

    const computePos = () => {
      const rect = anchorEl.getBoundingClientRect();
      const navRect = navEl?.getBoundingClientRect() ?? null;
      const isRight = rect.left > window.innerWidth / 2;
      const top = Math.max(8, Math.min(rect.top, window.innerHeight - 470));
      setPos(isRight
        ? { position: "fixed", top, right: window.innerWidth - (navRect?.left ?? rect.left) + 10, visibility: "visible" }
        : { position: "fixed", top, left: (navRect?.right ?? rect.right) + 10, visibility: "visible" }
      );
    };

    computePos();

    // Navbar expands on hover (width transitions from rail size to full).
    // Track its size so the dropdown follows the moving right edge instead
    // of staying at the click-time pixel position.
    const observer = navEl ? new ResizeObserver(computePos) : null;
    if (navEl && observer) observer.observe(navEl);
    window.addEventListener("resize", computePos);

    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node) && !anchorEl.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", computePos);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [anchorEl, onClose]);

  return (
    <div
      ref={ref}
      className="notif-dd"
      style={pos}
      role="dialog"
      aria-modal="true"
      aria-label={notifCopy.previewAria}
    >
      <div className="notif-dd-head">
        <span className="notif-dd-title" id="notif-dd-title">{notifCopy.title}</span>
        <button type="button" className="notif-dd-markall" onClick={onMarkAllRead} disabled={unreadCount === 0}>{notifCopy.markAllRead}</button>
      </div>
      <div className="notif-dd-list" aria-labelledby="notif-dd-title">
        {notifs.length === 0 ? (
          <div className="notif-dd-empty">{notifCopy.empty}</div>
        ) : notifs.map((notif) => {
          const name = notif.from.displayName || notif.from.username;
          const initials = name.slice(0, 2).toUpperCase();
          const grad = AVATAR_PLACEHOLDER_GRADIENT;

          return (
            <button
              type="button"
              key={notif.id}
              className={`notif-dd-item${!notif.read ? " notif-dd-item--unread" : ""}`}
              onClick={() => onOpenNotif(notif)}
              aria-label={`${name}: ${shellNotifVerb(notif.type, language)}`}
            >
              {notif.from.avatarUrl ? (() => {
                const src = displayMediaSrc(notif.from.avatarUrl) ?? notif.from.avatarUrl;
                return <Image src={src} alt="" width={36} height={36} sizes="36px" className="notif-dd-avatar notif-dd-avatar--img" unoptimized={shouldUnoptimizeNextImageSrc(src)} />;
              })() : (
                <div className="notif-dd-avatar" style={{ background: grad }} aria-hidden="true">{initials}</div>
              )}
              <div className="notif-dd-body">
                <p className="notif-dd-text"><strong aria-hidden="true">{name}</strong> <span aria-hidden="true">{shellNotifVerb(notif.type, language)}</span></p>
                <span className="notif-dd-time">{shellNotifTimeShort(notif.createdAt, language)}</span>
              </div>
              {!notif.read ? <span className="notif-dd-dot" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
      <Link href="/notifications" onClick={onClose} className="notif-dd-seeall">{notifCopy.seeAll}</Link>
    </div>
  );
}

const IMenu = () => <G><path d="M3 7h18M3 12h18M3 17h18" /></G>;
const IClose = () => <G><path d="M6 6l12 12M18 6 6 18" /></G>;
const IEdit = () => <G><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></G>;

function shellNotifHref(n: ShellNotif) {
  if (n.type === "follow" || n.type === "friend_joined") return userProfileHref(n.from);
  if (n.type === "message_request" || n.type === "message") return "/messages";
  if (n.post?.id) return `/post/${encodeURIComponent(n.post.id)}`;
  if (n.story?.id) return `/story/${encodeURIComponent(n.story.id)}`;
  return "/notifications";
}

// ── AppShell ───────────────────────────────────────────────────────────────
export function AppShell({ children }: { children: ReactNode }) {
  const { language } = useLanguagePreferences();
  const fc = useMemo(() => feedChromeStrings(language), [language]);
  const pathname = usePathname();
  const router = useRouter();
  const [pinned, setPinned]           = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSide, setSearchSide] = useState<"left" | "right">("right");
  const [storyOpen, setStoryOpen] = useState(false);
  // AI agent → "open story editor": watch the bridge nonce and pop the
  // existing CreateModal in story mode. Decoupled from CreateOpen so the
  // agent can launch a story from anywhere without going through the
  // type-picker step.
  const storyEditorNonce = useAiAgentBridge((s) => s.storyEditorNonce);
  useEffect(() => {
    if (storyEditorNonce === 0) return;
    setStoryOpen(true);
  }, [storyEditorNonce]);
  const [customizing, setCustomizing] = useState(false);
  const unreadNotifCount = useNotificationsStore((s) => s.unreadCount);
  const recentNotifs = useNotificationsStore((s) => s.recent);
  const setNotificationsSnapshot = useNotificationsStore((s) => s.setSnapshot);
  const patchNotification = useNotificationsStore((s) => s.patchNotification);
  const markAllNotifsRead = useNotificationsStore((s) => s.markAllRead);
  const setNotifUnreadCount = useNotificationsStore((s) => s.setUnreadCount);
  const unreadMsgCount = useMessagesUnreadStore((s) => s.count);
  const setUnreadMsgCount = useMessagesUnreadStore((s) => s.setCount);
  const [isAdmin, setIsAdmin] = useState(false);
  const [navSides, setNavSides] = useState<{ left: string[]; right: string[] }>({
    left: [...APP_SHELL_LEFT_KEYS],
    right: [...APP_SHELL_RIGHT_KEYS],
  });
  const dragRef = useRef<{ key: string; side: "left" | "right" } | null>(null);
  // Generic HTMLElement so the dropdown anchor can attach to either the
  // desktop NavBtn wrapper (a <div>) or the mobile bottom-tab <button>.
  // Callback refs let us assign to <div>/<button>/etc. without TS choking
  // on Ref<T> contravariance.
  const notifBtnRef = useRef<HTMLElement | null>(null);
  const createBtnRef = useRef<HTMLElement | null>(null);
  // The same anchor lives twice in the tree (desktop side rail + mobile
  // bottom tab bar) — exactly one of which is visible per breakpoint.
  // `getClientRects().length > 0` skips elements with `display: none`
  // anywhere up the chain, so we keep the ref on whichever one the
  // current viewport actually shows.
  const setNotifBtnRef = useCallback((el: HTMLElement | null) => {
    if (el && el.getClientRects().length > 0) notifBtnRef.current = el;
  }, []);
  const setCreateBtnRef = useCallback((el: HTMLElement | null) => {
    if (el && el.getClientRects().length > 0) createBtnRef.current = el;
  }, []);
  const settingsPanelRef = useRef<HTMLElement | null>(null);
  const searchPanelRef = useRef<HTMLElement | null>(null);
  useFocusTrap(settingsOpen, settingsPanelRef);
  useFocusTrap(searchOpen, searchPanelRef);

  useEffect(() => {
    if (!settingsOpen && !notifOpen && !createOpen && !searchOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSettingsOpen(false);
        setNotifOpen(false);
        setCreateOpen(false);
        setSearchOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, notifOpen, createOpen, searchOpen]);

  useEffect(() => {
    let alive = true;
    const refreshNotifications = () => {
      fetch("/api/notifications")
        .then(response => response.ok ? response.json() : null)
        .then(data => {
          if (!alive || !data) return;
          setNotificationsSnapshot({
            unreadCount: data.unreadCount ?? 0,
            recent: Array.isArray(data.notifications) ? data.notifications : [],
          });
        })
        .catch(() => {});
    };

    refreshNotifications();

    // Real-time push: SSE notifies us the moment a new notification is created
    // or marked read on another tab. EventSource auto-reconnects with the
    // server's `retry: 3000` hint; we keep a 60s polling backup for the case
    // where the SSE silently drops (proxy idle timeout, etc.).
    const es = new EventSource("/api/notifications/stream", { withCredentials: true });
    const onActivity = () => {
      refreshNotifications();
      // Fan out to other components in the same tab (e.g. NotificationsScreen)
      // so they can refresh without opening a duplicate EventSource — the
      // browser's 6-per-origin HTTP/1.1 cap is what was queueing POSTs and
      // breaking sends.
      window.dispatchEvent(new CustomEvent("linksy:notifications-activity"));
    };
    es.addEventListener("activity", onActivity);
    es.addEventListener("ready", () => undefined);
    es.onerror = () => { /* EventSource will auto-reconnect */ };

    const backupId = window.setInterval(refreshNotifications, 5000);
    window.addEventListener("focus", refreshNotifications);

    return () => {
      alive = false;
      es.removeEventListener("activity", onActivity);
      es.close();
      window.clearInterval(backupId);
      window.removeEventListener("focus", refreshNotifications);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive && data?.user?.isAdmin) setIsAdmin(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // Unread DM/group message count for the Messages tab badge.
  // Defense-in-depth so the badge never goes stale:
  //   • SSE push (`/api/conversations/stream`) — instant on activity.
  //   • SSE `ready` re-fires on every reconnect (browser auto-retry on
  //     HMR / proxy idle), so we resync the count after gaps.
  //   • 10s polling — covers the rare case where the stream silently
  //     dies between heartbeats with no error event.
  //   • Refresh on tab focus + `visibilitychange` — backgrounded tabs
  //     suspend timers, so we need an explicit catch-up on wake.
  useEffect(() => {
    let alive = true;
    const refreshUnread = () => {
      fetch("/api/conversations/unread-count", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!alive || !data) return;
          setUnreadMsgCount(data.unreadMessages ?? 0);
        })
        .catch(() => undefined);
    };

    refreshUnread();

    const es = new EventSource("/api/conversations/stream", { withCredentials: true });
    const onActivity = (event: MessageEvent) => {
      refreshUnread();
      // Fan out to MessagesScreen / DMWidget in the same tab so they get an
      // instant push without opening their own EventSource (which would push
      // us past Chrome's HTTP/1.1 6-per-origin cap and queue POSTs forever).
      // The activity event carries `{userId, conversationId, reason, ts}`.
      let detail: unknown = null;
      try { detail = JSON.parse(event.data); } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent("linksy:conversations-activity", { detail }));
    };
    const onReady = () => refreshUnread();
    es.addEventListener("activity", onActivity);
    es.addEventListener("ready", onReady);
    es.onerror = () => {
      // SSE dropped — browser auto-reconnects; do an immediate fetch so
      // we don't show a stale badge during the reconnect window.
      refreshUnread();
    };

    // SSE pushes unread changes; this is a fallback for when the stream
     // drops. 3s was needlessly aggressive — every tab hit the DB 20x/min.
    const backupId = window.setInterval(refreshUnread, 10000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshUnread();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refreshUnread);

    return () => {
      alive = false;
      es.removeEventListener("activity", onActivity);
      es.removeEventListener("ready", onReady);
      es.close();
      window.clearInterval(backupId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refreshUnread);
    };
  }, [setUnreadMsgCount]);

  // When the user navigates into /messages we optimistically clear the badge
  // — the conversation list will fully sync on its next refresh.
  useEffect(() => {
    if (pathname?.startsWith("/messages")) {
      setUnreadMsgCount(0);
    }
  }, [pathname, setUnreadMsgCount]);

  // Route change: close any open dropdown/drawer so the
  // `feed-shell--nav-hover-locked` class (which forces the left rail to
  // stay expanded while a dropdown is anchored to it) gets cleared.
  // Without this, navigating from e.g. /messages → /home with the notif
  // panel still open leaves the rail stuck wide on /home.
  useEffect(() => {
    setNotifOpen(false);
    setCreateOpen(false);
    setSettingsOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  // While the viewer is actually on /messages the badge should always read 0,
  // even if a new SSE refresh briefly recomputes the server count before the
  // read-receipts propagate. Lets the navbar reflect "you're already here".
  const displayedUnreadMsgCount = pathname?.startsWith("/messages") ? 0 : unreadMsgCount;

  // Online presence: ping every 30s while the tab is connected, drop the dot
  // immediately on unload via sendBeacon. The server TTL (90s) covers the gap
  // if a client crashes silently.
  useEffect(() => {
    const heartbeat = () => {
      fetch("/api/presence/heartbeat", { method: "POST", credentials: "include" }).catch(() => undefined);
    };
    heartbeat();
    const id = window.setInterval(heartbeat, 30_000);
    const onFocus = () => heartbeat();
    window.addEventListener("focus", onFocus);

    const goOffline = () => {
      // sendBeacon is the only reliable way to fire a request during unload.
      try {
        navigator.sendBeacon?.("/api/presence/offline", new Blob([""], { type: "text/plain" }));
      } catch {
        // ignore — server will TTL us out
      }
    };
    window.addEventListener("beforeunload", goOffline);
    window.addEventListener("pagehide", goOffline);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeunload", goOffline);
      window.removeEventListener("pagehide", goOffline);
      goOffline();
    };
  }, []);

  function toggleSearch(side: "left" | "right") {
    setSearchSide(side);
    setSearchOpen((current) => {
      const next = !current;
      if (next) {
        setSettingsOpen(false);
        setNotifOpen(false);
        setCreateOpen(false);
      }
      return next;
    });
  }

  function toggleNotifications() {
    setNotifOpen((v) => {
      if (!v) {
        setSettingsOpen(false);
        setCreateOpen(false);
        setSearchOpen(false);
      }
      return !v;
    });
  }

  function toggleCreate() {
    setCreateOpen((v) => {
      if (!v) {
        setSettingsOpen(false);
        setNotifOpen(false);
        setSearchOpen(false);
      }
      return !v;
    });
  }

  function handleOpenNotification(notif: ShellNotif) {
    const wasUnread = recentNotifs.some(item => item.id === notif.id && !item.read);
    patchNotification(notif.id, { read: true });
    if (wasUnread) setNotifUnreadCount(Math.max(0, unreadNotifCount - 1));
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [notif.id] }),
    }).catch(() => {});
    setNotifOpen(false);
    router.push(shellNotifHref(notif));
  }

  function handleMarkAllNotificationsRead() {
    markAllNotifsRead();
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
  }

  function moveWithin(side: "left" | "right", from: string, to: string) {
    setNavSides(prev => {
      const arr = [...prev[side]];
      const fromIndex = arr.indexOf(from);
      const toIndex = arr.indexOf(to);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
        return prev;
      }
      arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, from);
      return { ...prev, [side]: arr };
    });
  }

  function moveCross(fromSide: "left" | "right", key: string, toSide: "left" | "right", beforeKey?: string) {
    setNavSides(prev => {
      const from = prev[fromSide].filter(item => item !== key);
      const to = [...prev[toSide]];
      const insertIndex = beforeKey ? to.indexOf(beforeKey) : to.length;
      to.splice(insertIndex < 0 ? to.length : insertIndex, 0, key);
      return {
        left: toSide === "left" ? to : from,
        right: toSide === "right" ? to : from,
      };
    });
  }

  const isHomeRoute = pathname === "/home";
  // Routes that need to scroll their content (rather than being locked to a
  // 100vh frame with internal scroll). /notifications and /create both
  // render long forms / lists that were getting clipped under the mobile
  // top + bottom chrome before this.
  const isScrollableRoute =
    isHomeRoute ||
    pathname === "/notifications" ||
    pathname === "/create" ||
    pathname?.startsWith("/settings") === true ||
    pathname?.startsWith("/profile") === true;
  return (
    <div className={`feed-shell${pinned ? " feed-shell--left-pinned" : ""}${isHomeRoute ? " feed-shell--home" : ""}${createOpen || notifOpen ? " feed-shell--nav-hover-locked" : ""}`}>

      {/* ── Left navbar ── */}
      <nav className={`feed-sidenav feed-sidenav--left${pinned ? " feed-sidenav--pinned" : ""}`}>
        <div className="feed-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/psda.png"
            alt="Linksy logo"
            className="feed-logo-image"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            width={48}
            height={48}
          />
        </div>
        <div
          className="feed-nav-items"
          onDragOver={event => event.preventDefault()}
          onDrop={() => {
            const dragItem = dragRef.current;
            if (dragItem?.side === "right") {
              moveCross("right", dragItem.key, "left");
            }
          }}
        >
          {navSides.left.map(key => {
            const item = CHROME_SHELL_NAV_ITEMS.find(i => i.key === key)!;
            const icon = item.key === "profile"
              ? (
                <CurrentUserAvatar
                  className="nav-profile-avatar"
                  imageClassName="nav-profile-avatar-image"
                  showOnlineDot
                />
              )
              : <item.Icon />;
            const refForKey = key === "notifs" ? setNotifBtnRef : key === "create" ? setCreateBtnRef : undefined;
            return (
              <div
                key={key}
                ref={refForKey}
                draggable={customizing}
                className={`nav-drag-wrap${customizing ? " nav-drag-wrap--edit" : ""}`}
                onDragStart={event => {
                  dragRef.current = { key, side: "left" };
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => { dragRef.current = null; }}
                onDragOver={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  const dragItem = dragRef.current;
                  if (!dragItem || dragItem.key === key) {
                    return;
                  }
                  if (dragItem.side === "left") {
                    moveWithin("left", dragItem.key, key);
                    return;
                  }
                  moveCross("right", dragItem.key, "left", key);
                }}
              >
                {customizing && <span className="nav-drag-handle">⠿</span>}
                <NavBtn
                  icon={icon}
                  label={shellNavLabel(item.key, language)}
                  href={customizing || item.special === "notifs" || item.special === "create" || item.special === "search" ? undefined : item.href}
                  active={shellNavPathActive(pathname, item.href)}
                  onClick={customizing ? undefined : item.special === "notifs" ? toggleNotifications : item.special === "create" ? toggleCreate : item.special === "search" ? () => toggleSearch("left") : undefined}
                  pressed={item.special === "notifs" ? notifOpen : item.special === "create" ? createOpen : item.special === "search" ? searchOpen && searchSide === "left" : false}
                  badge={
                    item.key === "notifs" && unreadNotifCount > 0
                      ? unreadNotifCount
                      : item.key === "msgs" && displayedUnreadMsgCount > 0
                        ? displayedUnreadMsgCount
                        : undefined
                  }
                />
              </div>
            );
          })}
        </div>
        <div className="feed-nav-footer">
          {isAdmin && !customizing ? (
            <Link href="/admin" className="nav-admin-btn" title="Admin panel">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
                strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                <path d="M12 3l8 4v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4Z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <span>Admin</span>
            </Link>
          ) : null}
          <button
            type="button"
            className={`nav-customize-main-btn${customizing ? " nav-customize-main-btn--active" : ""}`}
            onClick={() => setCustomizing(value => !value)}
          >
            <IEdit />
            <span>{customizing ? fc.customizeDone : fc.customize}</span>
          </button>
          <NavBtn
            icon={pinned ? <IClose /> : <IMenu />}
            label={pinned ? fc.closeMenu : fc.openMenu}
            onClick={() => setPinned(v => !v)}
            pressed={pinned}
          />
        </div>
      </nav>

      {/* ── Main content (slot) ── */}
      {/* /home owns its own scroll via `.feed-shell--home .feed-main` rules.
          Other routes let their screen component manage internal scroll
          inside an `overflow: hidden` 100vh frame. */}
      <main
        className="feed-main"
        style={
          isScrollableRoute
            ? { padding: 0, minHeight: "100vh", overflowX: "hidden", overflowY: "auto" }
            : { padding: 0, overflow: "hidden", height: "100vh" }
        }
      >
        {children}
      </main>

      {/* ── Right navbar ── */}
      <nav className={`feed-sidenav feed-sidenav--right${settingsOpen || searchOpen ? " feed-sidenav--drawer-open" : ""}`}>
        {customizing && (
          <div className="nav-customize-hint">{fc.customizeHint}</div>
        )}
        <div
          className="feed-nav-items"
          onDragOver={event => event.preventDefault()}
          onDrop={() => {
            const dragItem = dragRef.current;
            if (dragItem?.side === "left") {
              moveCross("left", dragItem.key, "right");
            }
          }}
        >
          {navSides.right.map(key => {
            const item = CHROME_SHELL_NAV_ITEMS.find(i => i.key === key)!;
            const isNotifs   = item.special === "notifs";
            const isCreate   = item.special === "create";
            const isSearch   = item.special === "search";
            const pressed    = isNotifs ? notifOpen : isCreate ? createOpen : isSearch ? searchOpen && searchSide === "right" : false;
            const icon = item.key === "profile"
              ? (
                <CurrentUserAvatar
                  className="nav-profile-avatar"
                  imageClassName="nav-profile-avatar-image"
                  showOnlineDot
                />
              )
              : <item.Icon />;
            const refForKey = key === "notifs" ? setNotifBtnRef : key === "create" ? setCreateBtnRef : undefined;
            return (
              <div
                key={key}
                ref={refForKey}
                draggable={customizing}
                className={`nav-drag-wrap${customizing ? " nav-drag-wrap--edit" : ""}`}
                onDragStart={event => {
                  dragRef.current = { key, side: "right" };
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => { dragRef.current = null; }}
                onDragOver={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  const dragItem = dragRef.current;
                  if (!dragItem || dragItem.key === key) {
                    return;
                  }
                  if (dragItem.side === "right") {
                    moveWithin("right", dragItem.key, key);
                    return;
                  }
                  moveCross("left", dragItem.key, "right", key);
                }}
              >
                {customizing && <span className="nav-drag-handle">⠿</span>}
                <NavBtn
                  icon={icon}
                  label={shellNavLabel(item.key, language)}
                  right
                  ai={item.ai}
                  active={shellNavPathActive(pathname, item.href)}
                  href={customizing || isNotifs || isCreate || isSearch ? undefined : item.href}
                  onClick={customizing ? undefined : isNotifs ? toggleNotifications : isCreate ? toggleCreate : isSearch ? () => toggleSearch("right") : undefined}
                  pressed={pressed}
                  badge={
                    item.key === "notifs" && unreadNotifCount > 0
                      ? unreadNotifCount
                      : item.key === "msgs" && displayedUnreadMsgCount > 0
                        ? displayedUnreadMsgCount
                        : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      </nav>

      {/* ── Incoming call surface (always mounted; renders only when a call lands) ── */}
      <IncomingCallListener />

      {/* ── Notifications dropdown ── */}
      {notifOpen && (
        <ShellNotifDropdown
          anchorEl={notifBtnRef.current}
          notifs={recentNotifs}
          unreadCount={unreadNotifCount}
          onClose={() => setNotifOpen(false)}
          onMarkAllRead={handleMarkAllNotificationsRead}
          onOpenNotif={handleOpenNotification}
          language={language}
        />
      )}

      <div
        id="search-drawer-shell-aside"
        className={`theme-drawer-shell${searchOpen ? " theme-drawer-shell--open" : ""}${searchSide === "left" ? " theme-drawer-shell--left" : ""}`}
      >
        <button type="button" className="theme-drawer-backdrop" tabIndex={-1} aria-hidden="true" onClick={() => setSearchOpen(false)} />
        <aside
          ref={searchPanelRef}
          className={`theme-drawer-panel sd-panel${searchSide === "left" ? " theme-drawer-panel--left" : ""}`}
          role="dialog"
          aria-modal={searchOpen}
          aria-hidden={!searchOpen}
          {...(!searchOpen ? ({ inert: true } as { inert?: boolean }) : {})}
          aria-label={fc.ariaSearch}
        >
          <button type="button" className="theme-drawer-close" onClick={() => setSearchOpen(false)} aria-label={fc.ariaCloseSearch}><IClose /></button>
          <SearchDrawerCard onNavigate={() => setSearchOpen(false)} />
        </aside>
      </div>

      <div className={`theme-drawer-shell${settingsOpen ? " theme-drawer-shell--open" : ""}`}>
        <button type="button" className="theme-drawer-backdrop" tabIndex={-1} aria-hidden="true" onClick={() => setSettingsOpen(false)} />
        <aside
          ref={settingsPanelRef}
          className="theme-drawer-panel"
          role="dialog"
          aria-modal={settingsOpen}
          aria-hidden={!settingsOpen}
          {...(!settingsOpen ? ({ inert: true } as { inert?: boolean }) : {})}
          aria-label={fc.ariaSettingsDrawer}
        >
          <button type="button" className="theme-drawer-close" onClick={() => setSettingsOpen(false)} aria-label={fc.ariaCloseSettingsDrawer}><IClose /></button>
          <ThemeSettingsCard />
        </aside>
      </div>

      {/* ── Create dropdown (Post / Story picker) ── */}
      {createOpen && (
        <CreateDropdown
          anchorEl={createBtnRef.current}
          onClose={() => setCreateOpen(false)}
          onPost={() => { setCreateOpen(false); router.push("/create"); }}
          onStory={() => { setCreateOpen(false); setStoryOpen(true); }}
        />
      )}
      {storyOpen && <CreateModal initialStep="story" onClose={() => setStoryOpen(false)} />}

      {/*
        ── Mobile bottom tab bar ──────────────────────────────────────────
        Native iOS / Android pattern: fixed bottom strip with the five most
        important destinations. Only renders below 768px (CSS-gated). The
        center "+" tab opens the existing CreateDropdown anchored to itself.
      */}
      <nav
        className="bottom-tabs"
        role="navigation"
        aria-label="Primary mobile navigation"
      >
        <Link
          href="/home"
          className={`bottom-tab${pathname === "/home" ? " bottom-tab--active" : ""}`}
          aria-label="Home"
        >
          <span className="bottom-tab-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="24" height="24"><path d="M3 11l9-8 9 8M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/></svg></span>
          <span className="bottom-tab-lbl">Home</span>
        </Link>
        <button
          type="button"
          className={`bottom-tab${searchOpen ? " bottom-tab--active" : ""}`}
          onClick={() => toggleSearch("left")}
          aria-label="Search"
        >
          <span className="bottom-tab-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg></span>
          <span className="bottom-tab-lbl">Search</span>
        </button>
        <button
          ref={setCreateBtnRef}
          type="button"
          className="bottom-tab bottom-tab--primary"
          onClick={toggleCreate}
          aria-label="Create"
        >
          <span className="bottom-tab-ic bottom-tab-ic--primary"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" width="26" height="26"><path d="M12 5v14M5 12h14"/></svg></span>
        </button>
        <Link
          href="/messages"
          className={`bottom-tab${pathname?.startsWith("/messages") ? " bottom-tab--active" : ""}`}
          aria-label="Messages"
        >
          <span className="bottom-tab-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            {displayedUnreadMsgCount > 0 ? <span className="bottom-tab-badge">{displayedUnreadMsgCount > 9 ? "9+" : displayedUnreadMsgCount}</span> : null}
          </span>
          <span className="bottom-tab-lbl">Chats</span>
        </Link>
        <Link
          href="/profile"
          className={`bottom-tab${pathname?.startsWith("/profile") ? " bottom-tab--active" : ""}`}
          aria-label="Profile"
        >
          <span className="bottom-tab-ic">
            <CurrentUserAvatar className="bottom-tab-avatar" imageClassName="bottom-tab-avatar-img" />
          </span>
          <span className="bottom-tab-lbl">Me</span>
        </Link>
      </nav>

      {/*
        ── Mobile top bar (Instagram-style) ───────────────────────────────
        Compact strip with the Linksy wordmark on the left and the
        Notifications bell on the right. Renders only below 768px (CSS-
        gated). Lets us drop the "Alerts" bottom tab to make room for
        Messages while keeping notifications one tap away.
      */}
      <header className="mobile-topbar" role="banner">
        <Link href="/home" className="mobile-topbar-logo" aria-label="Home">
          <span className="mobile-topbar-wordmark">Linksy</span>
        </Link>
        <div className="mobile-topbar-actions">
          <Link href="/ai" className="mobile-topbar-btn" aria-label="Linksy AI">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
              <path d="M12 3v3M12 18v3M5 12H2M22 12h-3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/>
              <circle cx="12" cy="12" r="4"/>
            </svg>
          </Link>
          <button
            type="button"
            className="mobile-topbar-btn"
            onClick={toggleNotifications}
            aria-label="Notifications"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            {unreadNotifCount > 0 ? (
              <span className="mobile-topbar-badge">{unreadNotifCount > 9 ? "9+" : unreadNotifCount}</span>
            ) : null}
          </button>
        </div>
      </header>
    </div>
  );
}
