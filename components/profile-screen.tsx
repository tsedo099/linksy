"use client";

import { useLanguagePreferences } from "@/components/language-provider";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SkeletonProfileHeader, SkeletonGridItem } from "@/components/skeleton";
import { displayMediaSrc, getMediaUrl, isImageMediaUrl, isVideoMediaUrl } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import { AVATAR_PLACEHOLDER_GRADIENT } from "@/lib/avatar-placeholder";
import { userProfileHref } from "@/lib/user-url";
import { listenStoryViewed } from "@/lib/story-view-sync";
import { useCurrentUserStore, type CurrentUserAvatarData } from "@/lib/stores/current-user";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import type { ApiStoryGroup } from "@/components/feed/feed-story-model";
import { StoryViewer } from "@/components/feed/feed-story-viewer";
import { XPBar } from "@/components/XPBar";
import { CreatorToggle } from "@/components/CreatorToggle";
import {
  BANNER_GRAD,
  type ConnectionMode,
  type PostItem,
  PROFILE_STRINGS,
  type ProfileData,
  type ProfileHighlight,
  type ProfileTabKey,
  type SavedPostItem,
} from "@/components/profile/profile-types";
import {
  IcComment,
  IcEdit,
  IcGrid,
  IcSaved,
  IcTag,
} from "@/components/profile/profile-icons";
import {
  DiscussionCell,
  GridCell,
  SavedGridCell,
} from "@/components/profile/profile-grid";
import { ProfileHighlightsRow } from "@/components/profile/profile-highlights-row";
import { ConnectionsModal } from "@/components/profile/profile-connections-modal";
import { HighlightComposerModal } from "@/components/profile/profile-highlight-composer-modal";

export function ProfileScreen({ targetUsername }: { targetUsername?: string } = {}) {
  const { language } = useLanguagePreferences();
  const pt = useMemo(() => (language === "mn" ? PROFILE_STRINGS.mn : PROFILE_STRINGS.en), [language]);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const tabParam = searchParams.get("tab");
  const initTab: ProfileTabKey = tabParam === "discussions" || tabParam === "saved" || tabParam === "tagged" ? tabParam : "posts";
  const requestedUserId = searchParams.get("id") ?? searchParams.get("userId");
  const [tab, setTab]                     = useState<ProfileTabKey>(initTab);
  const [profile, setProfile]             = useState<ProfileData | null>(null);
  const [posts, setPosts]                 = useState<PostItem[]>([]);
  const [taggedPosts, setTaggedPosts]     = useState<PostItem[]>([]);
  const [savedPosts, setSavedPosts]       = useState<SavedPostItem[]>([]);
  const [highlights, setHighlights]       = useState<ProfileHighlight[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [highlightError, setHighlightError] = useState<string | null>(null);
  const [openingHighlightId, setOpeningHighlightId] = useState<string | null>(null);
  const [highlightComposerOpen, setHighlightComposerOpen] = useState(false);
  const viewerId = useCurrentUserStore((s) => s.user?.id ?? null);
  const [followPending, setFollowPending] = useState(false);
  const [followError, setFollowError]     = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [avatarBroken, setAvatarBroken]   = useState(false);
  const [profileStoryGroup, setProfileStoryGroup] = useState<ApiStoryGroup | null>(null);
  const [messagePending, setMessagePending] = useState(false);
  const router = useRouter();
  const isOwnProfile = Boolean(profile && viewerId && profile.id === viewerId);

  useEffect(() => {
    if (!profile || pathname !== "/profile" || !requestedUserId) return;
    if (requestedUserId !== profile.id) return;
    const canonical = userProfileHref(profile);
    if (!canonical.startsWith("/profile")) {
      const tab = searchParams.get("tab");
      const qs = tab && tab !== "posts" ? `?tab=${encodeURIComponent(tab)}` : "";
      router.replace(`${canonical}${qs}`);
    }
  }, [profile, pathname, requestedUserId, router, searchParams]);

  const hasActiveProfileStory = Boolean(profile?.hasActiveStory);
  const hasUnviewedProfileStory = Boolean(profile?.hasActiveStory && (profile.hasUnviewedStory ?? true));
  const mediaPosts = useMemo(
    () => posts.filter((post) => post.mediaUrls.some((url) => {
      const mediaUrl = getMediaUrl(url);
      return isImageMediaUrl(mediaUrl) || isVideoMediaUrl(mediaUrl);
    })),
    [posts],
  );
  const discussionPosts = useMemo(
    () => posts.filter((post) => !post.mediaUrls.some((url) => {
      const mediaUrl = getMediaUrl(url);
      return isImageMediaUrl(mediaUrl) || isVideoMediaUrl(mediaUrl);
    })),
    [posts],
  );
  const profileStoryRingClass = [
    "pg-avatar-ring",
    profile?.creatorMode ? "pg-avatar-ring--creator" : "",
    hasUnviewedProfileStory ? "pg-avatar-ring--story" : "",
    hasActiveProfileStory ? "pg-avatar-ring--clickable" : "",
  ].filter(Boolean).join(" ");

  const fetchHighlights = useCallback(async (userId: string) => {
    setHighlightsLoading(true);
    setHighlightError(null);
    try {
      const response = await fetch(`/api/users/${userId}/highlights`);
      if (!response.ok) {
        setHighlights([]);
        setHighlightError("Could not load highlights.");
        return;
      }
      const data = await response.json();
      setHighlights(Array.isArray(data.highlights) ? data.highlights : []);
    } catch {
      setHighlights([]);
      setHighlightError("Could not load highlights.");
    } finally {
      setHighlightsLoading(false);
    }
  }, []);

  const refreshProfilePosts = useCallback(async () => {
    if (!profile?.id) return;
    const postsRes = await fetch(`/api/users/${profile.id}/posts`);
    if (postsRes.ok) {
      const data = await postsRes.json();
      setPosts(Array.isArray(data.posts) ? data.posts : []);
    }
  }, [profile?.id]);

  const refreshTaggedPosts = useCallback(async () => {
    if (!profile?.id) return;
    const taggedRes = await fetch(`/api/users/${profile.id}/tagged-posts`);
    if (taggedRes.ok) {
      const data = await taggedRes.json();
      setTaggedPosts(Array.isArray(data.posts) ? data.posts : []);
    } else {
      setTaggedPosts([]);
    }
  }, [profile?.id]);

  useEffect(() => {
    setAvatarBroken(false);
  }, [profile?.avatarUrl]);

  const openProfileStory = useCallback(() => {
    if (!profile?.hasActiveStory) return;

    fetch(`/api/users/${profile.id}/stories`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setProfileStoryGroup(d?.group ?? null);
        setProfile(current => current?.id === profile.id
          ? {
              ...current,
              hasActiveStory: Boolean(d?.group),
              hasUnviewedStory: Boolean(d?.group && !d.group.allViewed),
            }
          : current,
        );
      })
      .catch(() => {});
  }, [profile?.hasActiveStory, profile?.id]);

  const refreshProfileStoryState = useCallback(() => {
    if (!profile?.id) return;

    fetch(`/api/users/${profile.id}/stories`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setProfile(current => current?.id === profile.id
          ? {
              ...current,
              hasActiveStory: Boolean(d?.group),
              hasUnviewedStory: Boolean(d?.group && !d.group.allViewed),
            }
          : current,
        );
        setProfileStoryGroup(current => current?.authorId === profile.id ? (d?.group ?? null) : current);
      })
      .catch(() => {});
  }, [profile?.id]);

  const handleProfileStoryViewed = useCallback((storyId: string) => {
    setProfileStoryGroup(current => {
      if (!current) return current;

      const stories = current.stories.map(story => (
        story.id === storyId ? { ...story, viewedByMe: true } : story
      ));
      const allViewed = stories.every(story => Boolean(story.viewedByMe));

      setProfile(profileCurrent => profileCurrent?.id === current.authorId
        ? { ...profileCurrent, hasUnviewedStory: !allViewed }
        : profileCurrent,
      );

      return { ...current, stories, allViewed };
    });
  }, []);

  const handleProfileStoryDeleted = useCallback((storyId: string, authorId: string) => {
    setProfileStoryGroup(current => {
      if (!current || current.authorId !== authorId) return current;

      const stories = current.stories.filter(story => story.id !== storyId);
      if (stories.length === 0) {
        setProfile(profileCurrent => profileCurrent?.id === authorId
          ? { ...profileCurrent, hasActiveStory: false, hasUnviewedStory: false }
          : profileCurrent,
        );
        return null;
      }

      const allViewed = stories.every(story => Boolean(story.viewedByMe));
      setProfile(profileCurrent => profileCurrent?.id === authorId
        ? { ...profileCurrent, hasActiveStory: true, hasUnviewedStory: !allViewed }
        : profileCurrent,
      );

      return { ...current, stories, allViewed };
    });
  }, []);

  useEffect(() => listenStoryViewed(({ storyId, authorId }) => {
    if (authorId !== profile?.id) return;
    handleProfileStoryViewed(storyId);
    refreshProfileStoryState();
  }), [handleProfileStoryViewed, profile?.id, refreshProfileStoryState]);

  useEffect(() => {
    if (!profile?.id) return;

    const refreshVisibleProfileStory = () => {
      if (document.visibilityState === "visible") refreshProfileStoryState();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshProfileStoryState();
    }, 15000);

    window.addEventListener("focus", refreshProfileStoryState);
    document.addEventListener("visibilitychange", refreshVisibleProfileStory);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshProfileStoryState);
      document.removeEventListener("visibilitychange", refreshVisibleProfileStory);
    };
  }, [profile?.id, refreshProfileStoryState]);

  useEffect(() => {
    async function load() {
      setLoadingProfile(true);
      setFollowError(null);
      setPosts([]);
      setTaggedPosts([]);
      setSavedPosts([]);
      setHighlights([]);
      setHighlightError(null);
      setOpeningHighlightId(null);
      setProfileStoryGroup(null);
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) {
          useCurrentUserStore.getState().setUser(null);
          setProfile(null);
          return;
        }
        const { user } = await meRes.json();
        useCurrentUserStore.getState().setUser(user as CurrentUserAvatarData);

        let profileUser: ProfileData = { ...user, followedByMe: false };
        let targetId = user.id;

        if (targetUsername && targetUsername.toLowerCase() !== user.username.toLowerCase()) {
          const profileRes = await fetch(`/api/users/by-username/${encodeURIComponent(targetUsername)}`);
          if (!profileRes.ok) {
            setProfile(null);
            setPosts([]);
            return;
          }
          const data = await profileRes.json();
          profileUser = data.user;
          targetId = profileUser.id;
        } else if (!targetUsername && requestedUserId && requestedUserId !== user.id) {
          const profileRes = await fetch(`/api/users/${requestedUserId}`);
          if (!profileRes.ok) {
            setProfile(null);
            setPosts([]);
            return;
          }
          const data = await profileRes.json();
          profileUser = data.user;
          targetId = profileUser.id;
        }

        setProfile(profileUser);
        const postsRes = await fetch(`/api/users/${targetId}/posts`);
        if (postsRes.ok) {
          const data = await postsRes.json();
          setPosts(data.posts);
        }

        const taggedRes = await fetch(`/api/users/${targetId}/tagged-posts`);
        if (taggedRes.ok) {
          const data = await taggedRes.json();
          setTaggedPosts(Array.isArray(data.posts) ? data.posts : []);
        }

        await fetchHighlights(targetId);

        if (targetId === user.id) {
          const savedRes = await fetch("/api/posts/saved");
          if (savedRes.ok) {
            const data = await savedRes.json();
            setSavedPosts(data.posts ?? []);
          }
        }
      } finally {
        setLoadingProfile(false);
      }
    }
    load();
  }, [fetchHighlights, requestedUserId, targetUsername]);

  const handleHighlightCreated = async () => {
    if (!profile) return;
    await fetchHighlights(profile.id);
  };

  const openHighlight = async (highlightId: string) => {
    if (openingHighlightId) return;
    setOpeningHighlightId(highlightId);
    setHighlightError(null);
    try {
      const response = await fetch(`/api/highlights/${highlightId}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.highlight || !Array.isArray(data.highlight.stories) || !data.highlight.author) {
        throw new Error(data?.error ?? "Could not open highlight.");
      }

      const stories = data.highlight.stories.map((story: {
        id: string;
        mediaUrl: string;
        mediaAlt?: string | null;
        caption: string | null;
        audience?: string;
        createdAt: string;
        expiresAt?: string;
        playbackMode?: string | null;
      }) => ({
        id: story.id,
        mediaUrl: story.mediaUrl,
        mediaAlt: story.mediaAlt,
        caption: story.caption,
        audience: story.audience ?? "PUBLIC",
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        playbackMode: story.playbackMode,
        viewedByMe: false,
        viewCount: 0,
      }));

      if (stories.length === 0) {
        throw new Error("This highlight has no visible stories.");
      }
      setProfileStoryGroup({
        authorId: data.highlight.author.id,
        author: {
          id: data.highlight.author.id,
          username: data.highlight.author.username,
          displayName: data.highlight.author.displayName,
          avatarUrl: data.highlight.author.avatarUrl,
        },
        stories,
        allViewed: false,
        isCloseCircle: stories.some((story: { audience?: string }) => story.audience === "CLOSE_CIRCLE"),
      });
    } catch (openError) {
      setHighlightError(openError instanceof Error ? openError.message : "Could not open highlight.");
    } finally {
      setOpeningHighlightId(null);
    }
  };

  const handleFollowToggle = async () => {
    if (!profile || isOwnProfile || followPending) return;

    const previousProfile = profile;
    const nextFollowing = !Boolean(previousProfile.followedByMe);
    setFollowError(null);
    setFollowPending(true);
    setProfile((current) => current
      ? {
          ...current,
          followedByMe: nextFollowing,
          _count: {
            ...current._count,
            followers: Math.max(0, current._count.followers + (nextFollowing ? 1 : -1)),
          },
        }
      : current,
    );

    try {
      const res = await fetch(`/api/users/${previousProfile.id}/follow`, { method: "POST" });
      if (!res.ok) {
        throw new Error("Follow request failed");
      }

      const data: { following: boolean } = await res.json();
      const followerDelta = data.following === Boolean(previousProfile.followedByMe)
        ? 0
        : data.following ? 1 : -1;

      setProfile((current) => current
        ? {
            ...current,
            followedByMe: data.following,
            _count: {
              ...current._count,
              followers: Math.max(0, previousProfile._count.followers + followerDelta),
            },
          }
        : current,
      );
    } catch {
      setProfile(previousProfile);
      setFollowError("Follow action failed. Please try again.");
    } finally {
      setFollowPending(false);
    }
  };

  const handleMessage = async () => {
    if (!profile || isOwnProfile || messagePending) return;
    setMessagePending(true);
    setFollowError(null);

    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: profile.id }),
      });
      const data = (await response.json().catch(() => null)) as
        | { conversationId?: string; error?: string }
        | null;

      if (!response.ok || !data?.conversationId) {
        throw new Error(data?.error ?? "Could not open chat.");
      }

      router.push(`/messages?conversation=${encodeURIComponent(data.conversationId)}`);
      // Keep pending until unmount so the label does not flash back before navigation paints.
    } catch (error) {
      setFollowError(error instanceof Error ? error.message : "Could not open chat.");
      setMessagePending(false);
    }
  };
  return (
    <>
        <div className="pg-layout">

          {/* â•â• LEFT SIDEBAR â•â• */}
          <aside className="pg-sidebar">

            {/* Banner + avatar */}
            <div className="pg-banner" style={{ background: BANNER_GRAD }}>
              <div className="pg-banner-fade" />
              <div className="pg-avatar-wrap">
                <div
                  className={profileStoryRingClass}
                  onClick={hasActiveProfileStory ? openProfileStory : undefined}
                  style={hasActiveProfileStory ? { cursor: "pointer" } : undefined}
                >
                  <div className="pg-avatar" style={!profile?.avatarUrl || avatarBroken ? { background: AVATAR_PLACEHOLDER_GRADIENT } : undefined}>
                    {profile?.avatarUrl && !avatarBroken ? (
                      <Image
                        src={displayMediaSrc(profile.avatarUrl) ?? profile.avatarUrl}
                        alt={`${profile.displayName} avatar`}
                        width={320}
                        height={320}
                        sizes="160px"
                        className="pg-avatar-img"
                        priority
                        unoptimized={shouldUnoptimizeNextImageSrc(
                          displayMediaSrc(profile.avatarUrl) ?? profile.avatarUrl,
                        )}
                        onError={() => setAvatarBroken(true)}
                      />
                    ) : (
                      <span className="pg-avatar-fallback">
                        {loadingProfile ? "..." : (profile?.displayName?.slice(0, 2).toUpperCase() ?? "?")}
                      </span>
                    )}
                  </div>
                </div>
                <span className="pg-online" />
              </div>
            </div>

            {/* Identity */}
            <div className="pg-sidebar-body">
              {loadingProfile ? (
                <SkeletonProfileHeader />
              ) : profile ? (
                <>
              <div className="pg-name-row">
                <h1 className="pg-name">{profile.displayName}</h1>
                {profile.isVerified && (
                  <span className="pg-verified">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                    </svg>
                  </span>
                )}
              </div>
              <p className="pg-handle">@{profile.username}</p>
              {profile.bio && <p className="pg-bio">{profile.bio}</p>}

              {/* Stats */}
              <div className="pg-stats">
                {[
                  { n: profile._count.posts,      l: pt.posts,     onClick: () => setTab("posts") },
                  { n: profile._count.followers,  l: pt.followers, onClick: () => setConnectionMode("followers" as const) },
                  { n: profile._count.following,  l: pt.following, onClick: () => setConnectionMode("following" as const) },
                ].map(s => (
                  <button key={s.l} type="button" className="pg-stat" onClick={s.onClick}>
                    <span className="pg-stat-n">{s.n}</span>
                    <span className="pg-stat-l">{s.l}</span>
                  </button>
                ))}
              </div>

              <ProfileHighlightsRow
                highlights={highlights}
                highlightsLoading={highlightsLoading}
                highlightError={highlightError}
                openingHighlightId={openingHighlightId}
                isOwnProfile={isOwnProfile}
                pt={pt}
                onOpenHighlight={openHighlight}
                onOpenComposer={() => setHighlightComposerOpen(true)}
              />

              {/* XP / Creator section â€” own profile only, shown before actions */}
              {isOwnProfile && (
                <div className="pg-creator-section">
                  <XPBar />
                  <CreatorToggle />
                </div>
              )}

              {/* Actions */}
              <div className="pg-actions">
                {isOwnProfile ? (
                  <>
                    <button
                      className="pg-act-btn pg-act-btn--primary"
                      type="button"
                      onClick={() => router.push("/settings?section=edit-profile")}
                    >
                      <IcEdit /> Edit profile
                    </button>
                    {/* Settings shortcut — the desktop sidebar already has a
                        Settings tab, but on mobile (where the sidebar is
                        hidden) this is the only way for a logged-in user to
                        reach /settings without typing the URL. */}
                    <Link
                      href="/settings"
                      className="pg-act-btn pg-act-btn--settings"
                      aria-label="Settings"
                      title="Settings"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden="true">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                      </svg>
                      <span className="pg-act-btn-label">Settings</span>
                    </Link>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`pg-follow-btn${profile.followedByMe ? " pg-follow-btn--done" : ""}`}
                      onClick={handleFollowToggle}
                      disabled={followPending}
                      aria-pressed={Boolean(profile.followedByMe)}
                    >
                      {followPending
                        ? pt.saving
                        : profile.followedByMe
                          ? pt.following
                          : profile.followsMe
                            ? pt.followBack
                            : pt.follow}
                    </button>
                    <button className="pg-act-btn" type="button" onClick={handleMessage} disabled={messagePending}>
                      {messagePending ? pt.opening : pt.message}
                    </button>
                  </>
                )}
              </div>
              {followError && <p className="pg-follow-error">{followError}</p>}
                </>
              ) : (
                <div style={{ padding: "1rem", opacity: 0.5 }}>Profile failed to load.</div>
              )}
            </div>
          </aside>

          {/* â•â• RIGHT CONTENT â•â• */}
          <div className="pg-content">

            {/* Tabs */}
            <div className="pg-tabs" role="tablist">
              {([
                { key: "posts",  icon: <IcGrid />,  label: pt.tabPosts  },
                { key: "discussions", icon: <IcComment />, label: pt.tabDiscussions },
                { key: "saved",  icon: <IcSaved />, label: pt.tabSaved  },
                { key: "tagged", icon: <IcTag />,   label: pt.tabTagged },
              ] as const).map(({ key, icon, label }) => (
                <button key={key} role="tab" aria-selected={tab === key}
                  className={`pg-tab${tab === key ? " pg-tab--active" : ""}`}
                  onClick={() => setTab(key)}>
                  {icon}<span>{label}</span>
                </button>
              ))}
            </div>

            {/* Bento grid */}
            {tab === "posts" && (
              loadingProfile ? (
                <div className="pg-saved-grid">
                  {[0,1,2,3,4,5].map(i => <SkeletonGridItem key={i} />)}
                </div>
              ) : mediaPosts.length === 0 ? (
                <div className="pg-empty"><p>No photo or video posts yet.</p></div>
              ) : (
                <div className="pg-saved-grid">
                  {mediaPosts.map((item, i) => (
                    <GridCell
                      key={item.id}
                      item={item}
                      idx={i}
                      isOwnProfile={isOwnProfile}
                      onRefreshPosts={refreshProfilePosts}
                    />
                  ))}
                </div>
              )
            )}

            {tab === "discussions" && (
              loadingProfile ? (
                <div className="pg-discussion-list">
                  {[0,1,2].map(i => <SkeletonGridItem key={i} />)}
                </div>
              ) : discussionPosts.length === 0 ? (
                <div className="pg-empty">
                  <IcComment />
                  <p>No text discussions yet.</p>
                </div>
              ) : (
                <div className="pg-discussion-list">
                  {discussionPosts.map((item) => <DiscussionCell key={item.id} item={item} />)}
                </div>
              )
            )}

            {tab === "saved" && (
              loadingProfile ? (
                <div className="pg-saved-grid">
                  {[0,1,2,3,4,5].map(i => <SkeletonGridItem key={i} />)}
                </div>
              ) : !isOwnProfile ? (
                <div className="pg-empty">
                  <IcSaved />
                  <p>Saved posts are only visible on your own profile.</p>
                </div>
              ) : savedPosts.length === 0 ? (
                <div className="pg-empty">
                  <IcSaved />
                  <p>No saved posts yet.</p>
                </div>
              ) : (
                <div className="pg-saved-grid">
                  {savedPosts.map((item, i) => <SavedGridCell key={item.id} item={item} idx={i} />)}
                </div>
              )
            )}

            {tab === "tagged" && (
              loadingProfile ? (
                <div className="pg-saved-grid">
                  {[0,1,2,3,4,5].map(i => <SkeletonGridItem key={i} />)}
                </div>
              ) : taggedPosts.length === 0 ? (
                <div className="pg-empty">
                  <IcTag />
                  <p>Photos and videos this profile is tagged in will appear here.</p>
                </div>
              ) : (
                <div className="pg-saved-grid">
                  {taggedPosts.map((item, i) => (
                    <GridCell
                      key={item.id}
                      item={item}
                      idx={i}
                      isOwnProfile={false}
                      onRefreshPosts={refreshTaggedPosts}
                    />
                  ))}
                </div>
              )
            )}

          </div>
        </div>
      {/* Profile-specific dialogs (above the AppShell content) */}
      {profile && connectionMode && (
        <ConnectionsModal
          mode={connectionMode}
          profile={profile}
          isOwnProfile={isOwnProfile}
          onClose={() => setConnectionMode(null)}
          onCountChange={(key, delta) => {
            setProfile((current) => current
              ? {
                  ...current,
                  _count: {
                    ...current._count,
                    [key]: Math.max(0, current._count[key] + delta),
                  },
                }
              : current,
            );
          }}
        />
      )}
      {highlightComposerOpen && profile && isOwnProfile && (
        <HighlightComposerModal
          userId={profile.id}
          onClose={() => setHighlightComposerOpen(false)}
          onCreated={handleHighlightCreated}
        />
      )}
      {profileStoryGroup && (
        <StoryViewer
          groups={[profileStoryGroup]}
          startIdx={0}
          onViewed={handleProfileStoryViewed}
          onDeleted={handleProfileStoryDeleted}
          onClose={() => startTransition(() => setProfileStoryGroup(null))}
        />
      )}
    </>
  );
}
