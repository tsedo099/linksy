"use client";

import { useLanguagePreferences } from "@/components/language-provider";

import { SkeletonPostCard } from "@/components/skeleton";
import { CreateModal } from "@/components/create-modal";
import dynamic from "next/dynamic";
import { displayMediaSrc } from "@/lib/media";
import { listenStoryViewed } from "@/lib/story-view-sync";
import { useCurrentUserAvatar } from "@/components/current-user-avatar";
import Link from "next/link";
import { userProfileHref } from "@/lib/user-url";
import { feedChromeStrings } from "@/lib/i18n/global-ui-strings";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ApiPost } from "./feed-api-post-types";
import { AiWidget } from "./feed-ai-widget";
import { ApiPostCard } from "./feed-post-cards";
import type { SuggestedUser } from "./feed-social";
import { StoriesRow } from "./feed-stories-row";
import { nextStoryExpiryMs, pruneExpiredStoryGroups, type ApiStoryGroup } from "./feed-story-model";

const StoryViewer = dynamic(
  () => import("./feed-story-viewer").then((m) => ({ default: m.StoryViewer })),
  { ssr: false },
);

const VIEWED_STORIES_STORAGE_PREFIX = "linksy-viewed-stories";
const VIEWED_STORIES_STORAGE_LIMIT = 800;

function viewedStoriesStorageKey(userId: string) {
  return `${VIEWED_STORIES_STORAGE_PREFIX}:${userId}`;
}

function readViewedStoryIds(userId: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(localStorage.getItem(viewedStoriesStorageKey(userId)) ?? "[]");
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set<string>();
  }
}

function writeViewedStoryIds(userId: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    const values = Array.from(ids).slice(-VIEWED_STORIES_STORAGE_LIMIT);
    localStorage.setItem(viewedStoriesStorageKey(userId), JSON.stringify(values));
  } catch {}
}

const DMWidget = dynamic(
  () => import("./feed-dm-widget").then((m) => ({ default: m.DMWidget })),
  { ssr: false },
);

const CreatePostCard = dynamic(
  () => import("./feed-create-post").then((m) => ({ default: m.CreatePostCard })),
  {
    ssr: false,
    loading: () => (
      <div className="cpc cpc-loading-skeleton" aria-busy="true" aria-label="Loading composer">
        <div className="cpc-inner">
          <div className="cpc-row">
            <div className="cpc-av" style={{ visibility: "hidden" }} aria-hidden />
            <div className="cpc-input-area" style={{ flex: 1 }}>
              <span className="cpc-placeholder" style={{ visibility: "hidden" }}>
                &nbsp;
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
);

/**
 * /home feed content. The surrounding chrome (left/right nav rails,
 * notifications dropdown, create dropdown, search/theme drawers) is
 * provided by `AppShell` via the `(shell)/layout.tsx` route group, so
 * this component renders only the main column + story-row interactions.
 */
export function FeedScreen() {
  const { language } = useLanguagePreferences();
  const fc = useMemo(() => feedChromeStrings(language), [language]);
  const [followed, setFollowed]           = useState<Record<string, boolean>>({});
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(true);
  const [suggestedPendingId, setSuggestedPendingId] = useState<string | null>(null);
  const [storyOpen, setStoryOpen]         = useState(false);
  const [activeStoryIdx, setActiveStoryIdx] = useState<number | null>(null);
  const [apiPosts, setApiPosts]       = useState<ApiPost[]>([]);
  const [, setNextCursor]   = useState<string | null>(null);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [apiStories, setApiStories]   = useState<ApiStoryGroup[]>([]);
  const viewedStoryIdsRef = useRef<Set<string>>(new Set());
  const currentUser = useCurrentUserAvatar();
  const [myStoryViewOpen, setMyStoryViewOpen] = useState(false);
  const [feedFilter, setFeedFilter]   = useState<"all"|"friends"|"close-circle"|"creator">("all");
  const [creatorMode, setCreatorMode] = useState(false);
  const [xpData, setXpData]           = useState<{ xp: number; level: number; progress: number; needed: number; subscriptionTier: string } | null>(null);
  const visibleStoryGroups = currentUser?.id ? apiStories.filter(g => g.authorId !== currentUser.id) : apiStories;
  const myStoryGroup = currentUser?.id ? (apiStories.find(g => g.authorId === currentUser.id) ?? null) : null;

  useEffect(() => {
    if (!currentUser?.id) return;
    viewedStoryIdsRef.current = readViewedStoryIds(currentUser.id);
    setApiStories((current) => current.map((group) => {
      const stories = group.stories.map((story) => (
        viewedStoryIdsRef.current.has(story.id) ? { ...story, viewedByMe: true } : story
      ));
      return {
        ...group,
        stories,
        allViewed: stories.every((story) => Boolean(story.viewedByMe)),
      };
    }));
  }, [currentUser?.id]);

  useEffect(() => {
    let alive = true;
    setSuggestedLoading(true);
    fetch("/api/users/suggested?limit=4")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!alive) return;
        const users = (data?.users ?? []) as SuggestedUser[];
        setSuggestedUsers(users);
        setFollowed((prev) => {
          const next = { ...prev };
          users.forEach((u) => { if (next[u.id] === undefined) next[u.id] = false; });
          return next;
        });
      })
      .catch(() => {
        if (alive) setSuggestedUsers([]);
      })
      .finally(() => {
        if (alive) setSuggestedLoading(false);
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const { body } = document;
    const cls = "feed-home-scroll-lock";
    root.classList.add(cls);
    body.classList.add(cls);
    return () => {
      root.classList.remove(cls);
      body.classList.remove(cls);
    };
  }, []);

  const loadPosts = (filter: string, replace = true) => {
    if (replace) setLoadingPosts(true);
    fetch(`/api/posts?filter=${filter}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.posts) {
          setApiPosts(replace ? data.posts : prev => [...prev, ...data.posts]);
          setNextCursor(data.nextCursor ?? null);
        }
      })
      .catch(() => {})
      .finally(() => { if (replace) setLoadingPosts(false); });
  };

  const loadStories = useCallback(() => {
    fetch("/api/stories")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.groups) {
          const viewedIds = viewedStoryIdsRef.current;
          const groups = (data.groups as ApiStoryGroup[]).map((group) => {
            const stories = group.stories.map((story) => (
              viewedIds.has(story.id) ? { ...story, viewedByMe: true } : story
            ));
            return {
              ...group,
              stories,
              allViewed: stories.every((story) => Boolean(story.viewedByMe)),
            };
          });
          setApiStories(pruneExpiredStoryGroups(groups));
        }
      })
      .catch(() => {});
  }, []);

  const markStoryViewed = useCallback((storyId: string, authorId: string) => {
    viewedStoryIdsRef.current.add(storyId);
    if (currentUser?.id) writeViewedStoryIds(currentUser.id, viewedStoryIdsRef.current);
    setApiStories(current => current.map(group => {
      if (group.authorId !== authorId && !group.stories.some((story) => story.id === storyId)) return group;

      const stories = group.stories.map(story => (
        story.id === storyId ? { ...story, viewedByMe: true } : story
      ));

      return {
        ...group,
        stories,
        allViewed: stories.every(story => Boolean(story.viewedByMe)),
      };
    }));
  }, [currentUser?.id]);

  const removeStoryFromFeed = useCallback((storyId: string, authorId: string) => {
    setApiStories(current => current
      .map(group => {
        if (group.authorId !== authorId) return group;
        const stories = group.stories.filter(story => story.id !== storyId);
        if (stories.length === 0) return null;
        return {
          ...group,
          stories,
          isCloseCircle: stories.some(story => story.audience === "CLOSE_CIRCLE"),
          allViewed: stories.every(story => Boolean(story.viewedByMe)),
        };
      })
      .filter((group): group is ApiStoryGroup => group !== null));
  }, []);

  useEffect(() => {
    loadPosts(feedFilter);
    loadStories();
    fetch("/api/user/xp")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setCreatorMode(data.creatorMode);
        if (data.creatorMode) {
          setXpData({ xp: data.xp, level: data.level, progress: data.progress, needed: data.needed, subscriptionTier: data.subscriptionTier });
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedFilter]);

  useEffect(() => listenStoryViewed(({ storyId, authorId }) => {
    markStoryViewed(storyId, authorId);
  }), [markStoryViewed]);

  useEffect(() => {
    const refreshVisibleStories = () => {
      if (document.visibilityState === "visible") loadStories();
    };
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadStories();
    }, 15000);

    window.addEventListener("focus", loadStories);
    document.addEventListener("visibilitychange", refreshVisibleStories);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", loadStories);
      document.removeEventListener("visibilitychange", refreshVisibleStories);
    };
  }, [loadStories]);

  useEffect(() => {
    setApiStories(prev => pruneExpiredStoryGroups(prev));

    const nextExpiry = nextStoryExpiryMs(apiStories);
    if (!nextExpiry) return;

    const timeout = window.setTimeout(() => {
      setApiStories(prev => pruneExpiredStoryGroups(prev));
    }, Math.max(0, nextExpiry - Date.now()) + 250);

    return () => window.clearTimeout(timeout);
  }, [apiStories]);

  const toggleFollowed = useCallback(async (userId: string) => {
    if (suggestedPendingId) return;
    const prev = Boolean(followed[userId]);
    setSuggestedPendingId(userId);
    setFollowed((v) => ({ ...v, [userId]: !prev }));
    try {
      const res = await fetch(`/api/users/${userId}/follow`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Follow failed");
      setFollowed((v) => ({ ...v, [userId]: Boolean(data.following) }));
    } catch {
      setFollowed((v) => ({ ...v, [userId]: prev }));
    } finally {
      setSuggestedPendingId(null);
    }
  }, [followed, suggestedPendingId]);

  const handlePostCreated = useCallback((post: ApiPost) => {
    setApiPosts((current) => [post, ...current]);
  }, []);

  return (
    <>
      <div className="feed-columns">
          {/* Sticky column header */}
          <div className="feed-col-header">
            <div className="feed-col-header-inner">
              <div className="feed-title-block">
                <span className="feed-col-eyebrow">
                  {creatorMode ? fc.eyebrowCreator : fc.eyebrowFeed}
                </span>
                <h2 className="feed-col-title">{fc.titleHomeBase}</h2>
              </div>
              <div className="feed-filter-bar">
                {([
                  { key: "all",          label: fc.filterForYou,      creator: false },
                  { key: "friends",      label: fc.filterFollowing,    creator: false },
                  { key: "close-circle", label: fc.filterCloseCircle, creator: false },
                  ...(creatorMode ? [{ key: "creator" as const, label: fc.filterCreator, creator: true }] : []),
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    className={`feed-filter-tab${feedFilter === tab.key ? " feed-filter-tab--active" : ""}${tab.creator ? " feed-filter-tab--creator" : ""}`}
                    onClick={() => setFeedFilter(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {creatorMode && xpData && (
                <div className="feed-xp-bar-wrap">
                  <span className="feed-xp-label">LVL {xpData.level}</span>
                  <div className="feed-xp-track">
                    <div className="feed-xp-fill" style={{ width: `${Math.min(100, Math.round((xpData.progress / xpData.needed) * 100))}%` }} />
                  </div>
                  <span className="feed-xp-label">{xpData.xp.toLocaleString()} XP</span>
                </div>
              )}
            </div>
          </div>

          {/* Posts column */}
          <div className="feed-posts-col">

            <div className="stories-section">
              <span className="stories-section-label">
                {creatorMode ? fc.storiesCreator : fc.storiesDefault}
              </span>
              <StoriesRow
                onOpen={setActiveStoryIdx}
                groups={visibleStoryGroups}
                myStoryGroup={myStoryGroup}
                onAddStory={() => setStoryOpen(true)}
                onViewMyStory={() => setMyStoryViewOpen(true)}
              />
            </div>

            <CreatePostCard onCreated={handlePostCreated} />

            <div className="post-list">
              {loadingPosts && [0, 1, 2].map((i) => <SkeletonPostCard key={i} />)}
              {!loadingPosts && apiPosts.length > 0
                ? apiPosts.map((post) => <ApiPostCard key={post.id} post={post} />)
                : null}
              {apiPosts.length === 0 && !loadingPosts && feedFilter === "all" && (
                <div className="feed-empty-state">
                  <p className="feed-empty-title">{fc.emptyAllTitle}</p>
                  <p className="feed-empty-sub">
                    {fc.emptyAllSub}
                  </p>
                  <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.8rem", flexWrap: "wrap" }}>
                    <Link href="/explore" className="rp-follow-btn" style={{ textDecoration: "none" }}>
                      {fc.explore}
                    </Link>
                    <Link href="/suggested" className="rp-follow-btn" style={{ textDecoration: "none", background: "transparent", border: "1px solid var(--app-border)", color: "var(--text)" }}>
                      {fc.findPeople}
                    </Link>
                  </div>
                </div>
              )}
              {apiPosts.length === 0 && !loadingPosts && feedFilter === "friends" && (
                <div className="feed-empty-state">
                  <p className="feed-empty-title">{fc.emptyFriendsTitle}</p>
                  <p className="feed-empty-sub">{fc.emptyFriendsSub}</p>
                </div>
              )}
              {apiPosts.length === 0 && !loadingPosts && feedFilter === "close-circle" && (
                <div className="feed-empty-state">
                  <p className="feed-empty-title">{fc.emptyCloseTitle}</p>
                  <p className="feed-empty-sub">{fc.emptyCloseSub}</p>
                </div>
              )}
            </div>
          </div>

          {/* Widgets column */}
          <aside className="feed-widgets-col">
            <div className="widget-card widget-suggested">
              <div className="widget-kicker">{fc.suggestedKicker}</div>
              <div className="widget-header widget-header--spread">
                <span className="widget-header-title">{fc.suggestedTitle}</span>
                <Link href="/suggested" className="widget-header-link">{fc.seeAll}</Link>
              </div>
              <div className="widget-list">
                {suggestedLoading && [0,1,2,3].map((i) => (
                  <div key={i} className="widget-person">
                    <div className="widget-person-avatar" style={{ background: "rgba(255,255,255,0.08)" }} />
                    <div className="widget-person-info">
                      <p className="widget-person-name" style={{ opacity: 0.55 }}>{fc.loading}</p>
                      <p className="widget-person-role" style={{ opacity: 0.35 }}> </p>
                    </div>
                    <button className="rp-follow-btn" disabled>{fc.follow}</button>
                  </div>
                ))}

                {!suggestedLoading && suggestedUsers.map((u) => {
                  const initials = (u.displayName || u.username).slice(0, 2).toUpperCase();
                  return (
                    <div key={u.id} className="widget-person">
                      <Link href={userProfileHref(u)} className="widget-person-profile" prefetch={false}>
                        <div className="widget-person-avatar" style={{ background: "linear-gradient(135deg,var(--app-accent),var(--app-accent-secondary))" }}>
                          {u.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={displayMediaSrc(u.avatarUrl) ?? u.avatarUrl}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              style={{ width: "100%", height: "100%", borderRadius: "999px", objectFit: "cover", display: "block" }}
                            />
                          ) : (
                            initials
                          )}
                        </div>
                        <div className="widget-person-info">
                          <p className="widget-person-name">{u.username}</p>
                          <p className="widget-person-role">{u.context}</p>
                        </div>
                      </Link>
                      <button
                        className={`rp-follow-btn${followed[u.id] ? " rp-follow-btn--done" : ""}`}
                        onClick={() => toggleFollowed(u.id)}
                        disabled={suggestedPendingId === u.id}
                      >
                        {followed[u.id] ? fc.unfollow : fc.follow}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

          </aside>
        </div>

      {storyOpen && <CreateModal initialStep="story" onClose={() => { setStoryOpen(false); loadStories(); }} />}
      {myStoryViewOpen && myStoryGroup && (
        <StoryViewer
          groups={[myStoryGroup, ...visibleStoryGroups]}
          startIdx={0}
          onViewed={markStoryViewed}
          onDeleted={removeStoryFromFeed}
          onClose={() => setMyStoryViewOpen(false)}
        />
      )}
      <DMWidget />
      <AiWidget />

      {activeStoryIdx !== null && visibleStoryGroups.length > 0 && (
        <StoryViewer
          groups={visibleStoryGroups}
          startIdx={Math.min(Math.max(0, activeStoryIdx), visibleStoryGroups.length - 1)}
          onViewed={markStoryViewed}
          onDeleted={removeStoryFromFeed}
          onClose={() => setActiveStoryIdx(null)}
        />
      )}
    </>
  );
}
