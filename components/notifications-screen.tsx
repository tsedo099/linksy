"use client";

import {
  NotificationsPanel,
  mapApiNotification,
  type NotificationItem,
} from "@/components/notifications/notifications-panel";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { NotificationFilter } from "@/components/notifications/notification-model";
import { useLanguagePreferences } from "@/components/language-provider";
import { notificationsScreenStrings } from "@/lib/i18n/notifications-screen-copy";

export function NotificationsScreen() {
  const router = useRouter();
  const { language } = useLanguagePreferences();
  const t = useMemo(() => notificationsScreenStrings(language), [language]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const [followed, setFollowed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
    const doFetch = (initial: boolean) => {
      if (initial) setLoading(true);
      fetch("/api/notifications")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!mounted) return;
          if (d?.notifications) setNotifications(d.notifications.map((row: Parameters<typeof mapApiNotification>[0]) => mapApiNotification(row, t)));
        })
        .catch(() => {})
        .finally(() => {
          if (mounted && initial) setLoading(false);
        });
    };
    doFetch(true);

    // Realtime strategy without opening a duplicate EventSource:
    //   • AppShell owns the only `/api/notifications/stream` SSE and
    //     re-dispatches activity as a `linksy:notifications-activity`
    //     window event — we just listen for it.
    //   • 5s polling backup for the rare gap (AppShell unmounted /
    //     reconnecting / event missed).
    //   • Refresh on focus for backgrounded tabs.
    // Opening our own EventSource here would push the tab past Chrome's
    // HTTP/1.1 6-per-origin cap and queue POSTs (this is what was
    // bricking message sends).
    const onActivity = () => doFetch(false);
    window.addEventListener("linksy:notifications-activity", onActivity);
    const backupId = window.setInterval(() => doFetch(false), 5000);
    const refreshOnFocus = () => doFetch(false);
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      mounted = false;
      window.removeEventListener("linksy:notifications-activity", onActivity);
      window.clearInterval(backupId);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [t]);

  const handleMarkRead = useCallback((id: string) => {
    setNotifications((cur) =>
      cur.map((item) => (item.id === id ? { ...item, unread: false } : item)),
    );
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => {});
  }, []);

  const handleOpenNotification = (item: NotificationItem) => {
    handleMarkRead(item.id);
    router.push(item.href);
  };

  const handleMarkAllRead = () => {
    setNotifications((cur) => cur.map((item) => ({ ...item, unread: false })));
    fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
  };

  const toggleFollow = (notifId: string, fromId: string) => {
    const item = notifications.find((entry) => entry.id === notifId);
    const previous = followed[notifId] ?? item?.followingActor ?? false;

    handleMarkRead(notifId);
    setFollowed((cur) => ({ ...cur, [notifId]: !previous }));
    fetch(`/api/users/${fromId}/follow`, { method: "POST" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Follow failed"))))
      .then((data: { following: boolean }) => {
        setFollowed((cur) => ({ ...cur, [notifId]: Boolean(data.following) }));
        setNotifications((cur) =>
          cur.map((entry) =>
            entry.id === notifId ? { ...entry, followingActor: Boolean(data.following) } : entry,
          ),
        );
      })
      .catch(() => {
        setFollowed((cur) => ({ ...cur, [notifId]: previous }));
      });
  };

  return (
    <NotificationsPanel
      loading={loading}
      notifications={notifications}
      activeFilter={activeFilter}
      setActiveFilter={setActiveFilter}
      followed={followed}
      onOpenNotification={handleOpenNotification}
      onMarkRead={handleMarkRead}
      onMarkAllRead={handleMarkAllRead}
      onToggleFollow={toggleFollow}
    />
  );
}
