"use client";

import { useLanguagePreferences } from "@/components/language-provider";
import { displayMediaSrc, getMediaUrl, isImageMediaUrl, isUploadedMediaUrl, isVideoMediaUrl } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import React, { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

import type { ApiPost } from "./feed-api-post-types";
import { CommentsDrawer } from "./feed-comments-drawer";
import { PostLocationMap } from "@/components/post-location-map";
import { AVATAR_PLACEHOLDER_GRADIENT } from "@/lib/avatar-placeholder";
import { userProfileHref } from "@/lib/user-url";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { IconBookmark, IconChat, IconHeart, IconMore, IconShare } from "./feed-icons";
import { PollBlock, type PollData } from "./feed-poll";
import { formatPostFeedTimestamp } from "@/lib/post-display-time";
import { MentionRichText } from "@/components/mention-rich-text";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { NsfwChip } from "@/components/nsfw-chip";

function ExpandableText({ text, dir = "auto" }: { text: string; dir?: "auto" | "ltr" | "rtl" }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (!expanded) setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    const raf = requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [text, expanded]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLButtonElement).blur();
    setExpanded(v => !v);
  };

  return (
    <div className="post-body-wrap">
      <p
        ref={ref}
        dir={dir}
        className={`post-body${!expanded ? " post-body--clamped" : ""}`}
      >
        <MentionRichText text={text} />
      </p>
      {overflows && (
        <button type="button" className="post-see-more" onClick={toggle}>
          {expanded ? "See less" : "See more"}
        </button>
      )}
    </div>
  );
}

const MEDIA_GRADS = [
  "linear-gradient(135deg,#1a1040,#6d28d9)",
  "linear-gradient(135deg,#0f2027,#134e4a)",
  "linear-gradient(135deg,#1c0000,#dc2626)",
  "linear-gradient(135deg,#000428,#004e92)",
  "linear-gradient(135deg,#0d1b0a,#14532d)",
];

export const ApiPostCard = memo(function ApiPostCard({ post }: { post: ApiPost }) {
  const { locale } = useLanguagePreferences();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post._count.likes);
  const [likePending, setLikePending] = useState(false);
  const [saved, setSaved] = useState(post.savedByMe);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [locationMapOpen, setLocationMapOpen] = useState(false);
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false);
  const lightboxRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(imageLightboxOpen, lightboxRef);
  const [shared, setShared] = useState(false);
  const [poll, setPoll] = useState(post.poll);
  const [pollBusy, setPollBusy] = useState(false);

  const initials = (post.author.displayName || post.author.username || "?")
    .trim()
    .slice(0, 2)
    .toUpperCase() || "?";
  const avatarGrad = AVATAR_PLACEHOLDER_GRADIENT;
  const authorAvatarSrc =
    post.author.avatarUrl?.trim()
      ? (displayMediaSrc(post.author.avatarUrl) ?? post.author.avatarUrl)
      : null;
  const mediaGrad = MEDIA_GRADS[post.id.charCodeAt(0) % MEDIA_GRADS.length];
  const rawPrimaryMedia = getMediaUrl(post.mediaUrls[0]);
  const primaryMediaUrl = rawPrimaryMedia ? (displayMediaSrc(rawPrimaryMedia) ?? rawPrimaryMedia) : undefined;
  const hasImageMedia = isImageMediaUrl(rawPrimaryMedia);
  const hasVideoMedia = isVideoMediaUrl(rawPrimaryMedia);
  const shouldContainMedia = hasImageMedia || hasVideoMedia;
  const isUploadedMedia = isUploadedMediaUrl(rawPrimaryMedia);
  const timeLabel = formatPostFeedTimestamp(post.createdAt, locale);
  const commentsEnabled = post.commentsEnabled !== false;
  const primaryImageAlt =
    post.mediaAltTexts?.[0]?.trim() ||
    post.caption?.trim() ||
    "Post media";

  async function toggleLike() {
    if (likePending) return;
    const previousLiked = liked;
    const previousCount = likeCount;
    const nextLiked = !previousLiked;
    setLikePending(true);
    setLiked(nextLiked);
    if (!post.likesHidden) {
      setLikeCount((value) => Math.max(0, value + (nextLiked ? 1 : -1)));
    }
    try {
      const res = await fetch(`/api/posts/${post.id}/like`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Like failed");
      setLiked(Boolean(data?.liked));
      if (!post.likesHidden && typeof data?.count === "number") {
        setLikeCount(data.count);
      }
    } catch {
      setLiked(previousLiked);
      setLikeCount(previousCount);
    } finally {
      setLikePending(false);
    }
  }

  async function toggleSave() {
    setSaved(v => !v);
    await fetch(`/api/posts/${post.id}/save`, { method: "POST" });
  }

  async function sharePost() {
    if (shared) return;
    const firstMedia = post.mediaUrls[0];
    const isUploaded = typeof firstMedia === "string" && isUploadedMediaUrl(firstMedia);
    const captionParts = [`From @${post.author.username}`];
    if (post.caption) captionParts.push(post.caption);
    const caption = captionParts.join(": ").slice(0, 500);

    try {
      const res = await fetch("/api/stories", {
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
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not share to story.");
      }
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch (err) {
      alert((err as Error).message);
    }
  }

  useEffect(() => {
    if (!imageLightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setImageLightboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [imageLightboxOpen]);

  useEffect(() => {
    if (!imageLightboxOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [imageLightboxOpen]);

  async function votePoll(optionIndex: number) {
    if (!poll || pollBusy || poll.expired) return;
    setPollBusy(true);
    try {
      const res = await fetch(`/api/polls/${poll.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionIndex }),
      });
      const data = (await res.json().catch(() => null)) as { poll?: ApiPost["poll"]; error?: string } | null;
      if (!res.ok || !data?.poll) {
        throw new Error(data?.error ?? "Could not vote on this poll.");
      }
      setPoll(data.poll);
    } catch {
      //
    } finally {
      setPollBusy(false);
    }
  }

  return (
    <article
      className={`post-card post-card--terminal post-card--legacy${post.author.creatorMode ? " post-card--creator" : ""}`}
      style={{ "--post-accent": avatarGrad } as React.CSSProperties}
    >
      <div className="post-top-bar">
        {post.caption ? (
          <div className="post-top-caption">
            <ExpandableText text={post.caption} />
            <div className="post-top-badges">
              {/* Translate toolbar removed per UX direction: the auto-detected
                  "EN" pill was misread as a language switcher and added
                  noise on every card. Translation can be re-enabled later
                  via a per-post menu action if needed. */}
              {post.author.creatorMode && (
                <span className="post-creator-badge">⚡ LV{post.author.level ?? 0}</span>
              )}
              {post.isCloseCircle && <span className="post-audience-badge">🔒 Close Circle</span>}
              {post.audience === "FRIENDS" && !post.isCloseCircle && <span className="post-audience-badge">👥 Friends</span>}
              {post.containsAdultContent ? <NsfwChip /> : null}
            </div>
          </div>
        ) : (
          <div className="post-top-caption post-top-caption--empty">
            <div className="post-top-badges">
              {post.author.creatorMode && (
                <span className="post-creator-badge">⚡ LV{post.author.level ?? 0}</span>
              )}
              {post.isCloseCircle && <span className="post-audience-badge">🔒 Close Circle</span>}
              {post.audience === "FRIENDS" && !post.isCloseCircle && <span className="post-audience-badge">👥 Friends</span>}
              {post.containsAdultContent ? <NsfwChip /> : null}
            </div>
          </div>
        )}
        <button className="post-more-btn icon-ghost-btn"><IconMore /></button>
      </div>

      {post.coAuthors && post.coAuthors.length > 0 ? (
        <div className="post-coauthors-bar">
          {post.coAuthors.map((u) => (
            <Link key={u.id} className="post-coauthor-link" href={userProfileHref(u)}>
              @{u.username}
            </Link>
          ))}
        </div>
      ) : null}

      {post.series ? (
        <div className="post-series-bar">
          <Link className="post-series-link" href={`/series/${encodeURIComponent(post.series.id)}`}>
            📚 {post.series.title}
          </Link>
        </div>
      ) : null}

      {poll ? (
        <div className="post-poll">
          <p className="post-poll-q">{poll.question}</p>
          <div className="post-poll-options">
            {poll.options.map((option) => {
              const reveal = poll.votedOptionIndex !== null || poll.expired;
              const selected = poll.votedOptionIndex === option.index;
              return (
                <button
                  key={option.index}
                  className={`post-poll-opt${selected ? " post-poll-opt--voted" : ""}${reveal ? " post-poll-opt--revealed" : ""}`}
                  onClick={() => votePoll(option.index)}
                  disabled={pollBusy || reveal}
                >
                  <span className="post-poll-bar" style={{ width: reveal ? `${option.percentage}%` : "0%" }} />
                  <span className="post-poll-label">{option.text}</span>
                  {reveal && <span className="post-poll-pct">{option.percentage}%</span>}
                </button>
              );
            })}
          </div>
          <p className="post-poll-meta">{poll.totalVotes} votes</p>
        </div>
      ) : null}

      {post.mediaUrls.length > 0 && (
        <div
          className={`post-media-wrap${shouldContainMedia ? " post-media-wrap--contain" : ""}${isUploadedMedia ? " post-media-wrap--uploaded" : ""}`}
        >
          {hasVideoMedia ? (
            <video
              src={primaryMediaUrl}
              className={`post-media-img${shouldContainMedia ? " post-media-img--contain" : ""}${isUploadedMedia ? " post-media-img--uploaded" : ""}`}
              controls
              playsInline
              preload="none"
              aria-label={primaryImageAlt}
            />
          ) : hasImageMedia ? (
            <div
              role="button"
              tabIndex={0}
              className="post-media-zoom-trigger"
              onClick={() => setImageLightboxOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setImageLightboxOpen(true);
                }
              }}
              aria-label="View full image"
            >
              <Image
                src={primaryMediaUrl ?? ""}
                alt={primaryImageAlt}
                width={1200}
                height={1200}
                sizes="(max-width: 768px) 100vw, (max-width: 1100px) 90vw, 832px"
                className={`post-media-img${shouldContainMedia ? " post-media-img--contain" : ""}${isUploadedMedia ? " post-media-img--uploaded" : ""}`}
                unoptimized={shouldUnoptimizeNextImageSrc(primaryMediaUrl ?? "")}
              />
            </div>
          ) : (
            <div className="post-media-img post-media-img--fallback" style={{ background: mediaGrad }} />
          )}
          {post.mediaUrls.length > 1 && (
            <span className="post-media-count">{post.mediaUrls.length} photos</span>
          )}
        </div>
      )}

      <div className="post-bottom-bar">
        <Link href={userProfileHref(post.author)} className="post-bottom-author post-bottom-author--profile">
          <div className="post-avatar-ring">
            <div
              className="post-avatar"
              style={authorAvatarSrc ? undefined : { background: avatarGrad }}
            >
              {authorAvatarSrc ? (
                <Image
                  src={authorAvatarSrc}
                  alt=""
                  width={96}
                  height={96}
                  sizes="40px"
                  className="post-avatar-img"
                  unoptimized={shouldUnoptimizeNextImageSrc(authorAvatarSrc)}
                />
              ) : (
                initials
              )}
            </div>
          </div>
          <div className="post-bottom-author-info">
            <p className="post-name">{post.author.displayName}</p>
            <p className="post-meta">@{post.author.username} · {timeLabel}</p>
          </div>
        </Link>
        <div className="post-bottom-actions">
          <button
            className={`action-btn${liked ? " action-btn--liked" : ""}`}
            onClick={toggleLike}
            disabled={likePending}
            aria-pressed={liked}
            aria-label={liked ? "Unlike post" : "Like post"}
          >
            <IconHeart filled={liked} /><span>{post.likesHidden ? "—" : likeCount}</span>
          </button>
          <button
            type="button"
            className="action-btn"
            onClick={() => setCommentsOpen(true)}
            aria-label={commentsEnabled ? "Comments" : "View comments"}
          >
            <IconChat /><span>{post._count.comments}</span>
          </button>
          <button className={`action-btn${shared ? " action-btn--shared" : ""}`} onClick={sharePost} title={shared ? "Shared to your story!" : "Share to your story"}>
            <IconShare />
          </button>
          <button className={`action-btn${saved ? " action-btn--saved" : ""}`} onClick={toggleSave}>
            <IconBookmark filled={saved} />
          </button>
        </div>
      </div>

      {post.location ? (
        <div className="post-loc-footer">
          <button
            type="button"
            className={`post-loc-toggle${locationMapOpen ? " post-loc-toggle--on" : ""}`}
            onClick={() => setLocationMapOpen((v) => !v)}
            aria-expanded={locationMapOpen}
            aria-controls={`post-loc-map-${post.id}`}
            id={`post-loc-label-${post.id}`}
          >
            <span className="post-loc-toggle-pin" aria-hidden>
              <MapPin className="post-loc-toggle-pin-ico" size={15} strokeWidth={2} />
            </span>
            <span className="post-loc-toggle-text">{post.location}</span>
          </button>
          {locationMapOpen ? (
            <div className="post-loc-map-slot" id={`post-loc-map-${post.id}`} role="region" aria-labelledby={`post-loc-label-${post.id}`}>
              <PostLocationMap location={post.location} title={post.location} />
            </div>
          ) : null}
        </div>
      ) : null}

      {commentsOpen && (
        <CommentsDrawer
          onClose={() => setCommentsOpen(false)}
          postId={post.id}
          postAuthor={post.author.displayName}
          postCaption={post.caption ?? ""}
          postGrad={avatarGrad}
          postImageUrl={hasImageMedia ? primaryMediaUrl ?? undefined : undefined}
          postMediaGrad={!hasImageMedia && primaryMediaUrl ? mediaGrad : undefined}
          commentsEnabled={commentsEnabled}
        />
      )}

      {typeof document !== "undefined" &&
        imageLightboxOpen &&
        hasImageMedia &&
        primaryMediaUrl &&
        createPortal(
          <div
            ref={lightboxRef}
            className="post-media-lightbox-backdrop post-media-lightbox-backdrop--feed"
            role="dialog"
            aria-modal="true"
            aria-label="Full image"
            onClick={() => setImageLightboxOpen(false)}
          >
            <button
              type="button"
              className="post-media-lightbox-close"
              onClick={(e) => {
                e.stopPropagation();
                setImageLightboxOpen(false);
              }}
              aria-label="Close"
            >
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={primaryMediaUrl}
              alt={primaryImageAlt}
              className="post-media-lightbox-img"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
    </article>
  );
});
