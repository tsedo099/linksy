"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { displayMediaSrc } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import { userProfileHref } from "@/lib/user-url";
import { useCurrentUserStore } from "@/lib/stores/current-user";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useRovingTabIndex } from "@/lib/use-roving-tabindex";
import { NavIconClose } from "@/components/feed/feed-icons";
import type { ConnectionMode, ConnectionUser, ProfileData } from "./profile-types";

function ConnectionAvatar({ user, size = 52 }: { user: ConnectionUser; size?: number }) {
  if (user.avatarUrl) {
    const src = displayMediaSrc(user.avatarUrl) ?? user.avatarUrl;
    return (
      <Image
        src={src}
        alt={user.displayName || user.username}
        width={Math.max(96, size * 2)}
        height={Math.max(96, size * 2)}
        sizes={`${size}px`}
        className="pg-rel-avatar pg-rel-avatar--img"
        style={{ width: size, height: size }}
        unoptimized={shouldUnoptimizeNextImageSrc(src)}
      />
    );
  }

  return (
    <span className="pg-rel-avatar" style={{ width: size, height: size }}>
      {(user.displayName || user.username).slice(0, 2).toUpperCase()}
    </span>
  );
}

export function ConnectionsModal({
  mode,
  profile,
  isOwnProfile,
  onClose,
  onCountChange,
}: {
  mode: ConnectionMode;
  profile: ProfileData;
  isOwnProfile: boolean;
  onClose: () => void;
  onCountChange: (key: "followers" | "following", delta: number) => void;
}) {
  const viewerId = useCurrentUserStore((s) => s.user?.id ?? null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<ConnectionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<ConnectionUser | null>(null);
  const title = mode === "followers" ? "Followers" : "Following";

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (confirmUser) {
          setConfirmUser(null);
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmUser, onClose]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setHidden(false);
    setUsers([]);
    setQuery("");
    setConfirmUser(null);
    fetch(`/api/users/${profile.id}/connections?type=${mode}`)
      .then((response) => response.ok ? response.json() : { users: [] })
      .then((data) => {
        if (!alive) return;
        setHidden(Boolean(data.hidden));
        setUsers(Array.isArray(data.users) ? data.users : []);
      })
      .catch(() => {
        if (alive) setUsers([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [mode, profile.id]);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) => {
      const haystack = `${user.username} ${user.displayName} ${user.bio ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [query, users]);

  const mainModalRef = useRef<HTMLElement>(null);
  const alertDialogRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useFocusTrap(!confirmUser, mainModalRef);
  useFocusTrap(Boolean(confirmUser), alertDialogRef);
  useRovingTabIndex({
    active: !confirmUser && !loading && !hidden && filteredUsers.length > 0,
    rootRef: listRef,
    itemSelector: ".pg-rel-row",
    orientation: "vertical",
  });

  const openUser = (user: ConnectionUser) => {
    onClose();
    router.push(userProfileHref(user));
  };

  const removeFollower = async (user: ConnectionUser) => {
    if (!isOwnProfile || actionId) return;
    const previousUsers = users;
    setActionId(user.id);
    setUsers((current) => current.filter((item) => item.id !== user.id));
    onCountChange("followers", -1);

    try {
      const response = await fetch(`/api/users/${profile.id}/connections`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "followers", targetId: user.id }),
      });
      if (!response.ok) throw new Error("Remove failed");
    } catch {
      setUsers(previousUsers);
      onCountChange("followers", 1);
    } finally {
      setActionId(null);
    }
  };

  const toggleFollow = async (user: ConnectionUser) => {
    if (user.isSelf || actionId) return;
    const previousFollowing = user.followedByMe;
    setActionId(user.id);
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, followedByMe: !previousFollowing } : item));

    try {
      const response = await fetch(`/api/users/${user.id}/follow`, { method: "POST" });
      if (!response.ok) throw new Error("Follow failed");
      const data: { following: boolean } = await response.json();
      const delta = data.following === previousFollowing ? 0 : data.following ? 1 : -1;

      if (profile.id === viewerId && mode === "following") {
        onCountChange("following", delta);
      }

      if (profile.id === viewerId && mode === "following" && previousFollowing && !data.following) {
        setUsers((current) => current.filter((item) => item.id !== user.id));
      } else {
        setUsers((current) => current.map((item) => item.id === user.id ? { ...item, followedByMe: data.following } : item));
      }
    } catch {
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, followedByMe: previousFollowing } : item));
    } finally {
      setActionId(null);
      setConfirmUser(null);
    }
  };

  const renderAction = (user: ConnectionUser) => {
    if (user.isSelf) return null;

    if (mode === "followers" && isOwnProfile) {
      return (
        <button
          type="button"
          className="pg-rel-action"
          disabled={actionId === user.id}
          onClick={(event) => {
            event.stopPropagation();
            removeFollower(user);
          }}
        >
          Remove
        </button>
      );
    }

    return (
      <button
        type="button"
        className={`pg-rel-action${user.followedByMe ? " pg-rel-action--following" : " pg-rel-action--primary"}`}
        disabled={actionId === user.id}
        onClick={(event) => {
          event.stopPropagation();
          if (user.followedByMe) {
            setConfirmUser(user);
          } else {
            toggleFollow(user);
          }
        }}
      >
        {user.followedByMe ? "Following" : "Follow"}
      </button>
    );
  };

  return (
    <div className="pg-rel-overlay" onClick={onClose}>
      <section ref={mainModalRef} className="pg-rel-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header className="pg-rel-head">
          <h2>{title}</h2>
          <button type="button" className="pg-rel-close" aria-label="Close" onClick={onClose}>
            <NavIconClose />
          </button>
        </header>

        <div className="pg-rel-search">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" autoFocus />
        </div>

        <div ref={listRef} className="pg-rel-list">
          {loading ? (
            [0, 1, 2, 3, 4].map((item) => <div key={item} className="pg-rel-skeleton" />)
          ) : hidden ? (
            <div className="pg-rel-empty">This list is private.</div>
          ) : filteredUsers.length === 0 ? (
            <div className="pg-rel-empty">No users found.</div>
          ) : (
            filteredUsers.map((user) => (
              <div key={user.id} className="pg-rel-row" role="button" tabIndex={0} onClick={() => openUser(user)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openUser(user);
                  }
                }}
              >
                <ConnectionAvatar user={user} />
                <div className="pg-rel-copy">
                  <span className="pg-rel-username">{user.username}</span>
                  <span className="pg-rel-name">{user.bio || user.displayName || user.username}</span>
                </div>
                {renderAction(user)}
              </div>
            ))
          )}
        </div>
      </section>

      {confirmUser && (
        <div className="pg-unfollow-layer" onClick={(event) => { event.stopPropagation(); setConfirmUser(null); }}>
          <section ref={alertDialogRef} className="pg-unfollow-dialog" role="alertdialog" aria-modal="true" aria-label="Unfollow" onClick={(event) => event.stopPropagation()}>
            <ConnectionAvatar user={confirmUser} size={96} />
            <p>If you change your mind, you&apos;ll have to request to follow @{confirmUser.username} again.</p>
            <button type="button" className="pg-unfollow-danger" disabled={actionId === confirmUser.id} onClick={() => toggleFollow(confirmUser)}>
              Unfollow
            </button>
            <button type="button" className="pg-unfollow-cancel" onClick={() => setConfirmUser(null)}>
              Cancel
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
