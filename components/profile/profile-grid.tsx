"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { memo, useState, type MouseEvent } from "react";
import { displayMediaSrc, getMediaUrl, isImageMediaUrl, isVideoMediaUrl } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import { CELL_GRADS, SAVED_GRADS, type PostItem, type SavedPostItem } from "./profile-types";
import { IcComment, IcHeart, IcPin } from "./profile-icons";

export const GridCell = memo(function GridCell({
  item,
  idx,
  isOwnProfile,
  onRefreshPosts,
}: {
  item: PostItem;
  idx: number;
  isOwnProfile: boolean;
  onRefreshPosts: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [pinBusy, setPinBusy] = useState(false);
  const grad = CELL_GRADS[idx % CELL_GRADS.length];
  const mediaUrl = getMediaUrl(item.mediaUrls[0]);
  const mediaSrc = mediaUrl ? (displayMediaSrc(mediaUrl) ?? mediaUrl) : undefined;
  const hasImageMedia = isImageMediaUrl(mediaUrl);
  const hasVideoMedia = isVideoMediaUrl(mediaUrl);
  const bg = hasImageMedia || hasVideoMedia ? undefined : grad;

  async function onPinClick(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (pinBusy) return;
    setPinBusy(true);
    try {
      const r = await fetch(`/api/posts/${encodeURIComponent(item.id)}/pin`, { method: "POST" });
      const raw = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = raw && typeof raw === "object" && raw && "error" in raw && typeof (raw as { error: unknown }).error === "string"
          ? (raw as { error: string }).error
          : "Could not update pin.";
        alert(msg);
        return;
      }
      await onRefreshPosts();
    } finally {
      setPinBusy(false);
    }
  }

  return (
    <div className="pg-grid-cell-wrap">
      {isOwnProfile ? (
        <button
          type="button"
          className="pg-grid-cell-pin"
          aria-label={item.isPinned ? "Unpin from profile" : "Pin to profile"}
          title={item.isPinned ? "Unpin" : "Pin"}
          disabled={pinBusy}
          onClick={onPinClick}
        >
          <IcPin />
        </button>
      ) : null}
      {item.isPinned ? (
        <span className="pg-grid-pin-badge" title="Pinned to profile">
          <IcPin />
          <span className="pg-grid-pin-badge-label">Pinned</span>
        </span>
      ) : null}
      <button className="pg-saved-post" type="button" onClick={() => router.push(`/post/${encodeURIComponent(item.id)}`)}>
        <div className="pg-saved-post-media" style={{ background: bg }}>
          {hasVideoMedia ? (
            <video
              src={mediaSrc}
              className="pg-saved-post-asset"
              muted
              playsInline
              preload="metadata"
            />
          ) : hasImageMedia ? (
            <Image
              src={mediaSrc ?? ""}
              alt=""
              width={400}
              height={400}
              sizes="(max-width: 768px) 33vw, 200px"
              className="pg-saved-post-asset"
              unoptimized={shouldUnoptimizeNextImageSrc(mediaSrc ?? "")}
            />
          ) : (
            <div className="pg-saved-post-fallback">
              <span>{item.caption?.trim() || "Post"}</span>
            </div>
          )}
          <div className="pg-saved-post-overlay">
            <span className="pg-saved-post-stat"><IcHeart filled />{item.likesHidden ? "—" : item._count.likes}</span>
            <span className="pg-saved-post-stat"><IcComment />{item._count.comments}</span>
          </div>
        </div>
      </button>
    </div>
  );
});

export const DiscussionCell = memo(function DiscussionCell({ item }: { item: PostItem }) {
  const router = useRouter();
  const text = item.caption?.trim() || "No text";

  return (
    <button
      type="button"
      className="pg-discussion-card"
      onClick={() => router.push(`/post/${encodeURIComponent(item.id)}`)}
    >
      <div className="pg-discussion-mark">
        <IcComment />
      </div>
      <div className="pg-discussion-main">
        <p className="pg-discussion-text">{text}</p>
        <div className="pg-discussion-meta">
          <span><IcHeart filled />{item.likesHidden ? "—" : item._count.likes}</span>
          <span><IcComment />{item._count.comments}</span>
          {item.isPinned ? <span><IcPin />Pinned</span> : null}
        </div>
      </div>
    </button>
  );
});

export const SavedGridCell = memo(function SavedGridCell({ item, idx }: { item: SavedPostItem; idx: number }) {
  const mediaUrl = getMediaUrl(item.imageUrl);
  const mediaSrc = mediaUrl ? (displayMediaSrc(mediaUrl) ?? mediaUrl) : undefined;
  const hasImageMedia = isImageMediaUrl(mediaUrl);
  const hasVideoMedia = isVideoMediaUrl(mediaUrl);
  const grad = SAVED_GRADS[idx % SAVED_GRADS.length];

  return (
    <button className="pg-saved-post" type="button">
      <div className="pg-saved-post-media" style={{ background: hasImageMedia || hasVideoMedia ? undefined : grad }}>
        {hasVideoMedia ? (
          <video src={mediaSrc} className="pg-saved-post-asset" muted playsInline preload="metadata" />
        ) : hasImageMedia ? (
          <Image
            src={mediaSrc ?? ""}
            alt=""
            width={400}
            height={400}
            sizes="(max-width: 768px) 33vw, 200px"
            className="pg-saved-post-asset"
            unoptimized={shouldUnoptimizeNextImageSrc(mediaSrc ?? "")}
          />
        ) : (
          <div className="pg-saved-post-fallback">
            <span>{item.caption?.trim() || "Saved post"}</span>
          </div>
        )}
        <div className="pg-saved-post-overlay">
          <span className="pg-saved-post-stat"><IcHeart filled />{item._count.likes}</span>
          <span className="pg-saved-post-stat"><IcComment />{item._count.comments}</span>
        </div>
      </div>
    </button>
  );
});
