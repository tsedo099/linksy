"use client";

import { useMemo } from "react";
import {
  FILTER_VALUES,
  GROUP_ORDER,
  filterLabel,
  type NotificationFilter,
  type NotificationItem,
} from "./notification-model";
import { NotificationGroupSection } from "./group";
import { useLanguagePreferences } from "@/components/language-provider";
import { notificationsScreenStrings } from "@/lib/i18n/notifications-screen-copy";

export type { NotificationFilter, NotificationItem, ApiNotification } from "./notification-model";
export { mapApiNotification, GROUP_ORDER } from "./notification-model";

type Props = {
  loading: boolean;
  notifications: NotificationItem[];
  activeFilter: NotificationFilter;
  setActiveFilter: (f: NotificationFilter) => void;
  followed: Record<string, boolean>;
  onOpenNotification: (item: NotificationItem) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onToggleFollow: (notifId: string, fromId: string) => void;
};

export function NotificationsPanel({
  loading,
  notifications,
  activeFilter,
  setActiveFilter,
  followed,
  onOpenNotification,
  onMarkRead,
  onMarkAllRead,
  onToggleFollow,
}: Props) {
  const { language } = useLanguagePreferences();
  const t = useMemo(() => notificationsScreenStrings(language), [language]);
  const filteredNotifications = useMemo(() => {
    if (activeFilter === "all") {
      return notifications;
    }
    return notifications.filter((item) => item.category === activeFilter);
  }, [activeFilter, notifications]);

  const groupedNotifications = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      items: filteredNotifications.filter((item) => item.group === group),
    })).filter((entry) => entry.items.length > 0);
  }, [filteredNotifications]);

  const filterCounts = useMemo<Record<NotificationFilter, number>>(
    () => ({
      all: notifications.length,
      mentions: notifications.filter((item) => item.category === "mentions").length,
      reactions: notifications.filter((item) => item.category === "reactions").length,
      follows: notifications.filter((item) => item.category === "follows").length,
      system: notifications.filter((item) => item.category === "system").length,
    }),
    [notifications],
  );

  const requestAvatars = notifications.filter((item) => item.category === "follows").slice(0, 3);
  const unreadCount = notifications.filter((item) => item.unread).length;

  return (
    <div className="ntf-page">
      <header className="ntf-head">
        <div className="ntf-head-copy">
          <p className="ntf-kicker">{t.kicker}</p>
          <h1>{t.title}</h1>
        </div>

        <button type="button" className="ntf-head-action" onClick={onMarkAllRead} disabled={unreadCount === 0}>
          {unreadCount === 0 ? t.allCaught : t.markAllRead}
        </button>
      </header>

      {filterCounts.follows > 0 ? (
        <section className="ntf-request-card">
          <div className="ntf-request-stack" aria-hidden="true">
            {requestAvatars.map((item) => (
              <span key={item.id} className="ntf-request-avatar" style={{ background: item.avatarGrad }}>
                {item.initials}
              </span>
            ))}
          </div>

          <div className="ntf-request-copy">
            <h2>{t.followActivityTitle}</h2>
            <p>{t.followActivityCount(filterCounts.follows)}</p>
          </div>

          <button type="button" className="ntf-request-btn" onClick={() => setActiveFilter("follows")}>
            {t.followActivityReview}
          </button>
        </section>
      ) : null}

      <div className="ntf-filter-row" role="tablist" aria-label={t.filtersAria}>
        {FILTER_VALUES.map((value) => {
          const active = activeFilter === value;

          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              className={`ntf-filter-chip${active ? " ntf-filter-chip--active" : ""}`}
              onClick={() => setActiveFilter(value)}
            >
              <span>{filterLabel(value, t)}</span>
              <small>{filterCounts[value]}</small>
            </button>
          );
        })}
      </div>

      <div className="ntf-feed-shell">
        {loading ? (
          <div className="ntf-list">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="ntf-skeleton" />
            ))}
          </div>
        ) : groupedNotifications.length === 0 ? (
          <div className="ntf-empty">
            <h2>{t.emptyTitle}</h2>
            <p>{t.emptyDesc}</p>
          </div>
        ) : (
          groupedNotifications.map(({ group, items }) => (
            <NotificationGroupSection
              key={group}
              group={group}
              items={items}
              followed={followed}
              strings={t}
              onOpen={onOpenNotification}
              onMarkRead={onMarkRead}
              onToggleFollow={onToggleFollow}
            />
          ))
        )}
      </div>
    </div>
  );
}
