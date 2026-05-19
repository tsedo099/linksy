"use client";

import type { CSSProperties } from "react";
import { useEffect } from "react";
import { AVATAR_PLACEHOLDER_GRADIENT } from "@/lib/avatar-placeholder";
import { displayMediaSrc } from "@/lib/media";
import {
  hydrateCurrentUserFromApi,
  useCurrentUserStore,
  type CurrentUserAvatarData,
} from "@/lib/stores/current-user";

export type { CurrentUserAvatarData };

const PROFILE_UPDATED_EVENT = "linksy:profile-updated";

export function broadcastCurrentUserAvatarUpdate(user: Partial<CurrentUserAvatarData>) {
  useCurrentUserStore.getState().patchUser(user);
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: { user } }));
}

export function useCurrentUserAvatar() {
  const user = useCurrentUserStore((s) => s.user);

  useEffect(() => {
    void hydrateCurrentUserFromApi();
  }, []);

  useEffect(() => {
    function handleProfileUpdated(event: Event) {
      const detail = (event as CustomEvent<{ user?: Partial<CurrentUserAvatarData> }>).detail;
      if (!detail?.user) return;
      useCurrentUserStore.getState().patchUser(detail.user);
    }

    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener);
    };
  }, []);

  return user;
}

export function CurrentUserAvatar({
  className,
  dotClassName = "feed-online-dot",
  imageClassName,
  showOnlineDot = false,
  style,
}: {
  className: string;
  dotClassName?: string;
  imageClassName: string;
  showOnlineDot?: boolean;
  style?: CSSProperties;
}) {
  const user = useCurrentUserAvatar();
  const initials = user?.displayName?.slice(0, 2).toUpperCase() || "ME";

  return (
    <div
      className={className}
      style={{
        ...style,
        ...(user?.avatarUrl ? null : { background: AVATAR_PLACEHOLDER_GRADIENT }),
      }}
    >
      {user?.avatarUrl ? (
        <img src={displayMediaSrc(user.avatarUrl) ?? user.avatarUrl} alt="Your avatar" className={imageClassName} />
      ) : (
        initials
      )}
      {showOnlineDot ? <span className={dotClassName} /> : null}
    </div>
  );
}
