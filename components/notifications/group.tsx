"use client";

import { groupLabel, type NotificationGroup, type NotificationItem } from "./notification-model";
import { NotificationItemRow } from "./item";
import type { NotificationsScreenStrings } from "@/lib/i18n/notifications-screen-copy";

type Props = {
  group: NotificationGroup;
  items: NotificationItem[];
  followed: Record<string, boolean>;
  strings: NotificationsScreenStrings;
  onOpen: (item: NotificationItem) => void;
  onMarkRead: (id: string) => void;
  onToggleFollow: (notifId: string, fromId: string) => void;
};

export function NotificationGroupSection({ group, items, followed, strings, onOpen, onMarkRead, onToggleFollow }: Props) {
  return (
    <section className="ntf-group">
      <div className="ntf-group-header">
        <h2>{groupLabel(group, strings)}</h2>
        <span>{items.length}</span>
      </div>

      <div className="ntf-list">
        {items.map((item) => (
          <NotificationItemRow
            key={item.id}
            item={item}
            isFollowing={followed[item.id] ?? item.followingActor}
            strings={strings}
            onOpen={onOpen}
            onMarkRead={onMarkRead}
            onToggleFollow={onToggleFollow}
          />
        ))}
      </div>
    </section>
  );
}
