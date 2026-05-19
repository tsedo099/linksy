"use client";

import { AVATAR_PLACEHOLDER_GRADIENT } from "@/lib/avatar-placeholder";
import { displayMediaSrc, getMediaUrl, isImageMediaUrl, isUploadedMediaUrl, isVideoMediaUrl } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import { userProfileHref } from "@/lib/user-url";
import { useLanguagePreferences } from "@/components/language-provider";
import { PostCaptionTranslateToolbar } from "@/components/post-caption-i18n";
import { formatPostFeedTimestamp } from "@/lib/post-display-time";
import { PostLocationMap } from "@/components/post-location-map";
import { MentionRichText } from "@/components/mention-rich-text";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

type PostAuthor = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified?: boolean;
};

type PostComment = {
  id: string;
  text: string;
  createdAt: string;
  moderationStatus?: "APPROVED" | "PENDING" | "REJECTED";
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

type PostPoll = {
  id: string;
  question: string;
  options: Array<{
    index: number;
    text: string;
    votes: number;
    percentage: number;
  }>;
  totalVotes: number;
  votedOptionIndex: number | null;
  expiresAt: string | null;
  expired: boolean;
};

type ModerationPreview = {
  action: "allow" | "warn" | "quarantine" | "block";
  userMessage: string | null;
  score: number;
};

type PostDetail = {
  id: string;
  caption: string | null;
  captionLang?: string | null;
  location: string | null;
  mediaUrls: string[];
  mediaAltTexts?: string[];
  createdAt: string;
  likedByMe: boolean;
  savedByMe: boolean;
  author: PostAuthor;
  comments: PostComment[];
  poll: PostPoll | null;
  _count: {
    likes: number;
    comments: number;
  };
  likesHidden?: boolean;
  commentsEnabled?: boolean;
  moderateComments?: boolean;
  series?: { id: string; title: string } | null;
  coAuthors?: PostAuthor[];
};

function postMediaAlt(post: Pick<PostDetail, "mediaAltTexts" | "caption">, index: number) {
  const fromAlt = post.mediaAltTexts?.[index]?.trim();
  if (fromAlt) return fromAlt;
  if (index === 0 && post.caption?.trim()) return post.caption.trim();
  return `Post media ${index + 1}`;
}

function Glyph({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function IconBack() {
  return <Glyph><path d="m15 18-6-6 6-6" /><path d="M21 12H9" /></Glyph>;
}

function IconHeart({ filled }: { filled: boolean }) {
  return (
    <Glyph filled={filled}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
    </Glyph>
  );
}

function IconComment() {
  return <Glyph><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" /></Glyph>;
}

function IconShare() {
  return <Glyph><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4 20-7Z" /></Glyph>;
}

function IconBookmark({ filled }: { filled: boolean }) {
  return <Glyph filled={filled}><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" /></Glyph>;
}

function IconMore() {
  return <Glyph><path d="M8 12h.01M12 12h.01M16 12h.01" /></Glyph>;
}

function IconChevron({ dir }: { dir: "left" | "right" }) {
  return dir === "left"
    ? <Glyph><path d="m15 18-6-6 6-6" /></Glyph>
    : <Glyph><path d="m9 18 6-6-6-6" /></Glyph>;
}

function displayName(user: { displayName: string; username: string }) {
  return user.displayName || user.username;
}

function initialsFor(user: { id: string; displayName: string; username: string }) {
  return displayName(user).slice(0, 2).toUpperCase();
}

const AVATAR_PLACEHOLDER_STYLE = { background: AVATAR_PLACEHOLDER_GRADIENT };

function Avatar({
  user,
  className = "",
}: {
  user: { id: string; displayName: string; username: string; avatarUrl: string | null };
  className?: string;
}) {
  const name = displayName(user);

  if (user.avatarUrl) {
    const src = displayMediaSrc(user.avatarUrl) ?? user.avatarUrl;
    return (
      <Image
        src={src}
        alt={name}
        width={96}
        height={96}
        sizes="42px"
        className={`pd-avatar pd-avatar--img ${className}`}
        unoptimized={shouldUnoptimizeNextImageSrc(src)}
      />
    );
  }

  return (
    <span className={`pd-avatar ${className}`} style={AVATAR_PLACEHOLDER_STYLE}>
      {initialsFor(user)}
    </span>
  );
}

function relativeTime(value: string, locale?: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString(locale || undefined, { month: "long", day: "numeric", year: "numeric" });
}

function relatedTilePreview(mediaUrls: string[]) {
  const raw = mediaUrls[0];
  if (!raw) return null;
  const trimmed = getMediaUrl(raw) ?? raw;
  return displayMediaSrc(trimmed) ?? trimmed;
}

type PostAnalytics = {
  views: number;
  likes: number;
  comments: number;
  saves: number;
  reposts: number;
  engagementTotal: number;
};

type RelatedThumbnail = {
  id: string;
  mediaUrls: string[];
};

const PD_STRINGS = {
  en: {
    back: "Back",
    post: "Post",
    postMedia: "Post media",
    prevMedia: "Previous media",
    nextMedia: "Next media",
    more: "More",
    like: "Like",
    unlike: "Unlike",
    comment: "Comment",
    shareToStory: "Share to your story",
    sharedToStory: "Shared to your story!",
    save: "Save",
    unsave: "Unsave",
    likesHidden: "Likes hidden",
    likeOne: "like",
    likeMany: "likes",
    commentOne: "comment",
    commentMany: "comments",
    mapPrefix: "Map",
    insightsAria: "Post insights",
    insightsTitle: "Your insights",
    views: "Views",
    likesLabel: "Likes",
    commentsLabel: "Comments",
    saves: "Saves",
    reposts: "Reposts",
    engagementFmt: (n: number) => `Total engagement (likes + comments + saves + reposts): `,
    noComments: "No comments yet.",
    albumPrefix: "Album",
  },
  mn: {
    back: "Буцах",
    post: "Пост",
    postMedia: "Постын медиа",
    prevMedia: "Өмнөх",
    nextMedia: "Дараагийнх",
    more: "Цааш",
    like: "Таалагдсан",
    unlike: "Болих",
    comment: "Сэтгэгдэл",
    shareToStory: "Story-доо хуваалцах",
    sharedToStory: "Story-д хуваалцлаа!",
    save: "Хадгалах",
    unsave: "Хасах",
    likesHidden: "Таалагдсан нь нуугдсан",
    likeOne: "таалагдсан",
    likeMany: "таалагдсан",
    commentOne: "сэтгэгдэл",
    commentMany: "сэтгэгдэл",
    mapPrefix: "Газрын зураг",
    insightsAria: "Постын статистик",
    insightsTitle: "Таны статистик",
    views: "Үзсэн",
    likesLabel: "Таалагдсан",
    commentsLabel: "Сэтгэгдэл",
    saves: "Хадгалсан",
    reposts: "Дахин нийтэлсэн",
    engagementFmt: (_n: number) => `Нийт оролцоо (таалагдсан + сэтгэгдэл + хадгалсан + дахин нийтэлсэн): `,
    noComments: "Сэтгэгдэл алга.",
    albumPrefix: "Цомог",
  },
};

export function PostDetailScreen({ postId }: { postId: string }) {
  const router = useRouter();
  const { locale, language } = useLanguagePreferences();
  const pdT = useMemo(() => (language === "mn" ? PD_STRINGS.mn : PD_STRINGS.en), [language]);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const viewSentRef = useRef(false);
  const [post, setPost] = useState<PostDetail | null>(null);
  const [activeMedia, setActiveMedia] = useState(0);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentSafety, setCommentSafety] = useState<ModerationPreview | null>(null);
  const [commentStatus, setCommentStatus] = useState<string | null>(null);
  const [likePending, setLikePending] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "sharing" | "shared">("idle");
  const [votingPoll, setVotingPoll] = useState(false);
  const [relatedPosts, setRelatedPosts] = useState<RelatedThumbnail[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<PostAnalytics | null>(null);

  useEffect(() => {
    let alive = true;
    setRelatedPosts([]);
    fetch(`/api/posts/${encodeURIComponent(postId)}/related`, { credentials: "include" })
      .then((response) => (response.ok ? response.json() : { posts: [] }))
      .then((data: { posts?: RelatedThumbnail[] }) => {
        if (!alive || !Array.isArray(data.posts)) return;
        setRelatedPosts(data.posts.filter((p) => Boolean(p?.id && p.id !== postId)));
      })
      .catch(() => {
        if (alive) setRelatedPosts([]);
      });
    return () => {
      alive = false;
    };
  }, [postId]);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.user?.id) setCurrentUserId(d.user.id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const text = commentText.trim();
    if (!text) {
      setCommentSafety(null);
      setCommentStatus(null);
      return;
    }

    let alive = true;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/comments/moderate-preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = (await response.json().catch(() => null)) as { moderation?: ModerationPreview } | null;
        if (alive && data?.moderation) setCommentSafety(data.moderation);
      } catch {
        if (alive) setCommentSafety(null);
      }
    }, 260);

    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, [commentText]);

  useEffect(() => {
    viewSentRef.current = false;
  }, [postId]);

  useEffect(() => {
    if (!post) return;
    if (viewSentRef.current) return;
    viewSentRef.current = true;
    fetch(`/api/posts/${encodeURIComponent(post.id)}/view`, { method: "POST", credentials: "include" }).catch(() => {});
  }, [post]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setActiveMedia(0);

    fetch(`/api/posts/${encodeURIComponent(postId)}`, { credentials: "include" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Post not found")))
      .then((data) => {
        if (alive) setPost(data.post);
      })
      .catch(() => {
        if (alive) setError("Post not found");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [postId]);

  useEffect(() => {
    if (!post || !currentUserId || currentUserId !== post.author.id) {
      setAnalytics(null);
      return;
    }
    let alive = true;
    fetch(`/api/posts/${encodeURIComponent(post.id)}/analytics`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.analytics) setAnalytics(d.analytics);
      })
      .catch(() => {
        if (alive) setAnalytics(null);
      });
    return () => {
      alive = false;
    };
  }, [post, currentUserId]);

  const mediaItems = useMemo(() => {
    return (post?.mediaUrls ?? []).map((url) => getMediaUrl(url)).filter((url): url is string => Boolean(url));
  }, [post?.mediaUrls]);

  const activeUrl = mediaItems[activeMedia] ?? null;
  const activeSrc = activeUrl ? (displayMediaSrc(activeUrl) ?? activeUrl) : null;
  const activeIsVideo = isVideoMediaUrl(activeUrl);
  const activeIsImage = isImageMediaUrl(activeUrl);
  const hasManyMedia = mediaItems.length > 1;

  const goMedia = (direction: -1 | 1) => {
    if (!mediaItems.length) return;
    setActiveMedia((current) => (current + direction + mediaItems.length) % mediaItems.length);
  };

  const handleLike = async () => {
    if (!post || likePending) return;

    const previous = post;
    const nextLiked = !post.likedByMe;
    setLikePending(true);
    setPost({
      ...post,
      likedByMe: nextLiked,
      _count: {
        ...post._count,
        likes: post.likesHidden
          ? post._count.likes
          : Math.max(0, post._count.likes + (nextLiked ? 1 : -1)),
      },
    });

    try {
      const response = await fetch(`/api/posts/${post.id}/like`, { method: "POST" });
      if (!response.ok) throw new Error("Like failed");
      const data = await response.json();
      setPost((current) => current ? {
        ...current,
        likedByMe: Boolean(data.liked),
        _count: {
          ...current._count,
          likes: current.likesHidden
            ? current._count.likes
            : Number(data.count ?? current._count.likes),
        },
      } : current);
    } catch {
      setPost(previous);
    } finally {
      setLikePending(false);
    }
  };

  const handleSave = async () => {
    if (!post) return;

    const previous = post;
    setPost({ ...post, savedByMe: !post.savedByMe });

    try {
      const response = await fetch(`/api/posts/${post.id}/save`, { method: "POST" });
      if (!response.ok) throw new Error("Save failed");
      const data = await response.json();
      setPost((current) => current ? { ...current, savedByMe: Boolean(data.saved) } : current);
    } catch {
      setPost(previous);
    }
  };

  const handleShare = async () => {
    if (!post || shareState !== "idle") return;
    const firstMedia = post.mediaUrls[0];
    const isUploaded = typeof firstMedia === "string" && isUploadedMediaUrl(firstMedia);
    const captionParts = [`From @${post.author.username}`];
    if (post.caption) captionParts.push(post.caption);
    const caption = captionParts.join(": ").slice(0, 500);

    setShareState("sharing");
    try {
      const response = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl: isUploaded ? firstMedia : undefined,
          mediaAlt: isUploaded
            ? (post.mediaAltTexts?.[0]?.trim() || post.caption?.trim() || `Post from @${post.author.username}`).slice(0, 2000)
            : undefined,
          caption,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Could not share to story.");
      }
      setShareState("shared");
      setTimeout(() => setShareState("idle"), 2000);
    } catch (err) {
      setShareState("idle");
      alert((err as Error).message);
    }
  };

  const handleSubmitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = commentText.trim();
    if (!post || !text || submittingComment) return;
    if (post.commentsEnabled === false) return;
    if (commentSafety?.action === "block") {
      setCommentStatus(commentSafety.userMessage ?? "This comment cannot be posted.");
      return;
    }

    setSubmittingComment(true);
    setCommentStatus(null);
    try {
      const response = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await response.json().catch(() => null)) as {
        comment?: PostComment;
        safety?: ModerationPreview;
        warning?: { warningsInWindow: number; banApplied: boolean; banUntil: string | null } | null;
        error?: string;
        banUntil?: string;
      } | null;
      if (response.status === 403 && data?.banUntil) {
        setCommentStatus(
          `Commenting is paused until ${new Date(data.banUntil).toLocaleString()}. See Safe Social.`,
        );
        return;
      }
      if (!response.ok || !data?.comment) throw new Error(data?.error ?? "Comment failed");
      const c = data.comment;
      const bumpPublicCount =
        c.moderationStatus === "APPROVED" || c.moderationStatus == null;
      setPost((current) => current ? {
        ...current,
        comments: [...current.comments, c],
        _count: {
          ...current._count,
          comments: bumpPublicCount ? current._count.comments + 1 : current._count.comments,
        },
      } : current);
      setCommentText("");
      const warning = data.warning;
      const note = warning
        ? `Warning issued (${warning.warningsInWindow}/3). Comment posted — repeated warnings pause commenting for a week.`
        : data.safety?.userMessage ?? (c.moderationStatus === "PENDING" ? "Comment sent for review." : null);
      setCommentStatus(note);
    } catch (err) {
      setCommentStatus((err as Error).message);
    } finally {
      setSubmittingComment(false);
    }
  };

  const moderateComment = async (commentId: string, action: "approve" | "reject") => {
    if (!post || currentUserId !== post.author.id) return;
    try {
      const response = await fetch(`/api/comments/${encodeURIComponent(commentId)}/moderate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) return;
      const data = (await response.json()) as { comment?: PostComment };
      const updated = data.comment;
      if (action === "reject") {
        setPost((p) => (p ? {
          ...p,
          comments: p.comments.filter((c) => c.id !== commentId),
        } : p));
        return;
      }
      setPost((p) => {
        if (!p || !updated) return p;
        const wasPending = p.comments.some(
          (c) => c.id === commentId && c.moderationStatus === "PENDING",
        );
        return {
          ...p,
          comments: p.comments.map((c) => (c.id === commentId ? { ...c, ...updated } : c)),
          _count: {
            ...p._count,
            comments: wasPending ? p._count.comments + 1 : p._count.comments,
          },
        };
      });
    } catch {
      /* ignore */
    }
  };

  const handlePollVote = async (optionIndex: number) => {
    if (!post?.poll || votingPoll || post.poll.expired) return;

    setVotingPoll(true);
    try {
      const response = await fetch(`/api/polls/${post.poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIndex }),
      });
      const data = (await response.json().catch(() => null)) as { poll?: PostPoll; error?: string } | null;
      if (!response.ok || !data?.poll) {
        throw new Error(data?.error ?? "Could not submit poll vote.");
      }
      setPost((current) => current ? { ...current, poll: data.poll ?? current.poll } : current);
    } catch {
      // Keep the detail screen open; voting can be retried.
    } finally {
      setVotingPoll(false);
    }
  };

  if (loading) {
    return (
      <div className="pd-page">
        <div className="pd-status">Loading post...</div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="pd-page">
        <div className="pd-status pd-status--error">
          <p>{error ?? "Post not found"}</p>
          <button type="button" onClick={() => router.push("/notifications")}>Back to notifications</button>
        </div>
      </div>
    );
  }

  const authorName = displayName(post.author);
  const activeMediaAlt = postMediaAlt(post, activeMedia);

  return (
    <div className="pd-page">
      <div className="pd-shell">
        <div className="pd-topbar">
          <button type="button" className="pd-back" onClick={() => router.back()} aria-label={pdT.back}>
            <IconBack />
          </button>
          <span className="pd-topbar-title">{pdT.post}</span>
        </div>

        <article className="pd-card">
          <section className="pd-media-stage" aria-label={pdT.postMedia}>
            <div className="pd-media-frame">
              {activeUrl && activeIsVideo ? (
                <video key={activeUrl} src={activeSrc ?? activeUrl} className="pd-media" controls playsInline aria-label={activeMediaAlt} />
              ) : activeUrl && activeIsImage ? (
                <Image
                  key={activeUrl}
                  src={activeSrc ?? activeUrl}
                  alt={activeMediaAlt}
                  fill
                  className="pd-media"
                  sizes="(max-width: 900px) 100vw, 55vw"
                  priority
                  unoptimized={shouldUnoptimizeNextImageSrc(activeSrc ?? activeUrl)}
                />
              ) : (
                <div className="pd-media-empty">
                  <span>{pdT.post}</span>
                </div>
              )}

              {hasManyMedia ? (
                <>
                  <button type="button" className="pd-media-nav pd-media-nav--left" onClick={() => goMedia(-1)} aria-label={pdT.prevMedia}>
                    <IconChevron dir="left" />
                  </button>
                  <button type="button" className="pd-media-nav pd-media-nav--right" onClick={() => goMedia(1)} aria-label={pdT.nextMedia}>
                    <IconChevron dir="right" />
                  </button>
                  <div className="pd-media-dots" aria-hidden="true">
                    {mediaItems.map((url, index) => (
                      <span key={`${url}-${index}`} className={index === activeMedia ? "pd-media-dot pd-media-dot--active" : "pd-media-dot"} />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <aside className="pd-side">
            <header className="pd-side-header">
              <Link href={userProfileHref(post.author)} className="pd-author-link">
                <Avatar user={post.author} />
                <span className="pd-author-copy">
                  <span className="pd-author-name">{authorName}</span>
                  {post.location ? <span className="pd-author-loc">{post.location}</span> : null}
                  <span className="pd-author-sub">@{post.author.username}</span>
                </span>
              </Link>
              <button type="button" className="pd-icon-btn" aria-label={pdT.more}>
                <IconMore />
              </button>
            </header>

            <div className="pd-thread">
              {post.coAuthors && post.coAuthors.length > 0 ? (
                <div className="pd-coauthors">
                  {post.coAuthors.map((u) => (
                    <Link key={u.id} href={userProfileHref(u)} className="pd-coauthor-link">
                      @{u.username}
                    </Link>
                  ))}
                </div>
              ) : null}
              {post.series ? (
                <div className="pd-series-row">
                  <Link href={`/series/${encodeURIComponent(post.series.id)}`} className="pd-series-link">
                    {pdT.albumPrefix} · {post.series.title}
                  </Link>
                </div>
              ) : null}
              {post.caption ? (
                <div className="pd-comment-row pd-caption-row">
                  <Avatar user={post.author} />
                  <div className="pd-comment-copy">
                    <p className="pd-comment-text" dir="auto"><strong>{authorName}</strong> <MentionRichText text={post.caption} /></p>
                    <PostCaptionTranslateToolbar text={post.caption} captionLang={post.captionLang} variant="detail" />
                    <span className="pd-comment-time">{formatPostFeedTimestamp(post.createdAt, locale)}</span>
                  </div>
                </div>
              ) : null}

              {post.comments.length === 0 ? (
                <div className="pd-empty-comments">
                  <h2>{pdT.noComments}</h2>
                  <p>{post.commentsEnabled === false ? "Comments are turned off." : "Start the conversation."}</p>
                </div>
              ) : (
                <div className="pd-comment-list">
                  {post.comments.map((comment) => {
                    const commentAuthor = displayName(comment.author);
                    const pending = comment.moderationStatus === "PENDING";
                    const canModerate = Boolean(
                      currentUserId && currentUserId === post.author.id && pending,
                    );

                    return (
                      <div className="pd-comment-row" key={comment.id}>
                        <Avatar user={comment.author} />
                        <div className="pd-comment-copy">
                          <p className="pd-comment-text"><strong>{commentAuthor}</strong> <MentionRichText text={comment.text} /></p>
                          <div className="pd-comment-meta">
                            <span className="pd-comment-time">{relativeTime(comment.createdAt, locale)}</span>
                            {pending ? (
                              <span className="pd-mod-badge">
                                {currentUserId === post.author.id ? "Pending review" : "Pending approval"}
                              </span>
                            ) : null}
                          </div>
                          {canModerate ? (
                            <div className="pd-mod-actions">
                              <button
                                type="button"
                                className="pd-mod-btn pd-mod-btn--ok"
                                onClick={() => moderateComment(comment.id, "approve")}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="pd-mod-btn"
                                onClick={() => moderateComment(comment.id, "reject")}
                              >
                                Reject
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {post.poll ? (
                <div className="pd-poll">
                  <p className="pd-poll-question">{post.poll.question}</p>
                  <div className="pd-poll-options">
                    {post.poll.options.map((option) => {
                      const selected = option.index === post.poll?.votedOptionIndex;
                      const reveal = post.poll?.votedOptionIndex !== null || post.poll?.expired;
                      return (
                        <button
                          key={option.index}
                          type="button"
                          className={`pd-poll-option${selected ? " pd-poll-option--selected" : ""}${reveal ? " pd-poll-option--revealed" : ""}`}
                          onClick={() => handlePollVote(option.index)}
                          disabled={votingPoll || reveal}
                        >
                          <span className="pd-poll-bar" style={{ width: reveal ? `${option.percentage}%` : "0%" }} />
                          <span className="pd-poll-label">{option.text}</span>
                          {reveal ? <span className="pd-poll-pct">{option.percentage}%</span> : null}
                        </button>
                      );
                    })}
                  </div>
                  <p className="pd-poll-meta">
                    {post.poll.totalVotes} votes
                    {post.poll.expiresAt ? ` · Ends ${new Date(post.poll.expiresAt).toLocaleString()}` : ""}
                  </p>
                </div>
              ) : null}
            </div>

            <footer className="pd-footer">
              <div className="pd-action-row">
                <div className="pd-action-left">
                  <button
                    type="button"
                    className={`pd-icon-btn pd-action-btn${post.likedByMe ? " pd-action-btn--liked" : ""}`}
                    onClick={handleLike}
                    aria-label={post.likedByMe ? pdT.unlike : pdT.like}
                    aria-pressed={post.likedByMe}
                    disabled={likePending}
                  >
                    <IconHeart filled={post.likedByMe} />
                  </button>
                  <button
                    type="button"
                    className="pd-icon-btn pd-action-btn"
                    onClick={() => post.commentsEnabled !== false && commentInputRef.current?.focus()}
                    aria-label={pdT.comment}
                    disabled={post.commentsEnabled === false}
                  >
                    <IconComment />
                  </button>
                  <button
                    type="button"
                    className={`pd-icon-btn pd-action-btn${shareState === "shared" ? " pd-action-btn--shared" : ""}`}
                    onClick={handleShare}
                    disabled={shareState !== "idle"}
                    aria-label={pdT.shareToStory}
                    title={shareState === "shared" ? pdT.sharedToStory : pdT.shareToStory}
                  >
                    <IconShare />
                  </button>
                </div>
                <button
                  type="button"
                  className={`pd-icon-btn pd-action-btn${post.savedByMe ? " pd-action-btn--saved" : ""}`}
                  onClick={handleSave}
                  aria-label={post.savedByMe ? pdT.unsave : pdT.save}
                  aria-pressed={post.savedByMe}
                >
                  <IconBookmark filled={post.savedByMe} />
                </button>
              </div>

              <div className="pd-stats">
                {post.likesHidden ? (
                  <span>{pdT.likesHidden}</span>
                ) : (
                  <>
                    <strong>{post._count.likes}</strong> {post._count.likes === 1 ? pdT.likeOne : pdT.likeMany}
                  </>
                )}
                {" · "}
                <strong>{post._count.comments}</strong> {post._count.comments === 1 ? pdT.commentOne : pdT.commentMany}
              </div>

              {post.location ? (
                <div className="pd-loc-map-block">
                  <p className="pd-loc-map-title">{pdT.mapPrefix} · {post.location}</p>
                  <PostLocationMap location={post.location} title={post.location} />
                </div>
              ) : null}

              {analytics ? (
                <section className="pd-insights" aria-label={pdT.insightsAria}>
                  <p className="pd-insights-title">{pdT.insightsTitle}</p>
                  <ul className="pd-insights-grid">
                    <li>
                      <span className="pd-insight-val">{analytics.views}</span>
                      <span className="pd-insight-lbl">{pdT.views}</span>
                    </li>
                    <li>
                      <span className="pd-insight-val">{analytics.likes}</span>
                      <span className="pd-insight-lbl">{pdT.likesLabel}</span>
                    </li>
                    <li>
                      <span className="pd-insight-val">{analytics.comments}</span>
                      <span className="pd-insight-lbl">{pdT.commentsLabel}</span>
                    </li>
                    <li>
                      <span className="pd-insight-val">{analytics.saves}</span>
                      <span className="pd-insight-lbl">{pdT.saves}</span>
                    </li>
                    <li>
                      <span className="pd-insight-val">{analytics.reposts}</span>
                      <span className="pd-insight-lbl">{pdT.reposts}</span>
                    </li>
                  </ul>
                  <p className="pd-insights-foot">
                    {pdT.engagementFmt(analytics.engagementTotal)}<strong>{analytics.engagementTotal}</strong>
                  </p>
                </section>
              ) : null}

              <time className="pd-date" dateTime={post.createdAt}>{formatPostFeedTimestamp(post.createdAt, locale)}</time>

              {commentStatus || (commentSafety && commentSafety.action !== "allow" && commentSafety.userMessage) ? (
                <div className={`pd-safety-note${commentSafety?.action === "block" ? " pd-safety-note--block" : ""}`}>
                  {commentStatus ?? commentSafety?.userMessage}
                </div>
              ) : null}

              <form className="pd-comment-form" onSubmit={handleSubmitComment}>
                <input
                  ref={commentInputRef}
                  value={commentText}
                  onChange={(event) => {
                    setCommentText(event.target.value);
                    setCommentStatus(null);
                  }}
                  placeholder={post.commentsEnabled === false ? "Comments are turned off" : "Add a comment..."}
                  disabled={submittingComment || post.commentsEnabled === false}
                />
                <button
                  type="submit"
                  disabled={!commentText.trim() || submittingComment || post.commentsEnabled === false || commentSafety?.action === "block"}
                >
                  Post
                </button>
              </form>
            </footer>
          </aside>
        </article>

        {relatedPosts.length ? (
          <section className="pd-related" aria-labelledby="pd-related-heading">
            <h2 id="pd-related-heading" className="pd-related-heading">
              Та бас сонирхож болзошгүй
            </h2>
            <div className="pd-related-rail">
              {relatedPosts.map((rp) => {
                const thumb = relatedTilePreview(rp.mediaUrls);
                return (
                  <Link key={rp.id} href={`/post/${encodeURIComponent(rp.id)}`} className="pd-related-card">
                    {thumb ? (
                      <Image
                        src={thumb}
                        alt=""
                        width={400}
                        height={400}
                        sizes="120px"
                        className="pd-related-thumb"
                        unoptimized={shouldUnoptimizeNextImageSrc(thumb)}
                      />
                    ) : (
                      <div className="pd-related-thumb pd-related-thumb--placeholder" />
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
