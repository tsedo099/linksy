"use client";

import Image from "next/image";
import { displayMediaSrc, getMediaUrl, isImageMediaUrl, isVideoMediaUrl } from "@/lib/media";
import { shouldUnoptimizeNextImageSrc } from "@/lib/next-image-patterns";
import { HIGHLIGHT_GRADS, type ProfileHighlight, type ProfileStrings } from "./profile-types";
import { IcArchive, IcPlay } from "./profile-icons";

export function HighlightCover({ item, idx }: { item: Pick<ProfileHighlight, "title" | "coverMediaUrl">; idx: number }) {
  const coverUrl = getMediaUrl(item.coverMediaUrl);
  const coverSrc = coverUrl ? (displayMediaSrc(coverUrl) ?? coverUrl) : "";
  const hasImage = isImageMediaUrl(coverUrl);
  const hasVideo = isVideoMediaUrl(coverUrl);

  if (hasImage) {
    return (
      <div className="pg-hl-disc">
        <Image
          src={coverSrc}
          alt=""
          width={200}
          height={200}
          sizes="72px"
          className="pg-hl-cover-img"
          unoptimized={shouldUnoptimizeNextImageSrc(coverSrc)}
        />
      </div>
    );
  }

  if (hasVideo) {
    return (
      <div className="pg-hl-disc pg-hl-disc--video">
        <IcPlay />
      </div>
    );
  }

  return (
    <div className="pg-hl-disc" style={{ background: HIGHLIGHT_GRADS[idx % HIGHLIGHT_GRADS.length] }}>
      {(item.title.trim()[0] ?? "H").toUpperCase()}
    </div>
  );
}

export function ProfileHighlightsRow({
  highlights,
  highlightsLoading,
  highlightError,
  openingHighlightId,
  isOwnProfile,
  pt,
  onOpenHighlight,
  onOpenComposer,
}: {
  highlights: ProfileHighlight[];
  highlightsLoading: boolean;
  highlightError: string | null;
  openingHighlightId: string | null;
  isOwnProfile: boolean;
  pt: ProfileStrings;
  onOpenHighlight: (highlightId: string) => void;
  onOpenComposer: () => void;
}) {
  return (
    <div className="pg-hl-section">
      <div className="pg-hl-head">
        <div>
          <p className="pg-section-label">Highlights</p>
          <p className="pg-hl-sub">
            {highlightsLoading
              ? pt.momentsLoading
              : highlights.length > 0
                ? `${highlights.length} collection${highlights.length === 1 ? "" : "s"}`
                : isOwnProfile
                  ? pt.momentsHint
                  : pt.momentsEmpty}
          </p>
        </div>
        {isOwnProfile && highlights.length > 0 && (
          <button type="button" className="pg-hl-new-mini" onClick={onOpenComposer}>
            New
          </button>
        )}
      </div>
      <div className="pg-hl-row">
        {highlightsLoading ? (
          [0, 1, 2].map((item) => (
            <div key={item} className="pg-hl pg-hl--skeleton" aria-hidden="true">
              <div className="pg-hl-ring"><div className="pg-hl-disc" /></div>
              <span className="pg-hl-label" />
            </div>
          ))
        ) : (
          highlights.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              className={`pg-hl${openingHighlightId === item.id ? " pg-hl--opening" : ""}`}
              onClick={() => onOpenHighlight(item.id)}
              disabled={Boolean(openingHighlightId)}
              aria-label={`Open ${item.title} highlight, ${item.storyCount} ${item.storyCount === 1 ? "story" : "stories"}`}
            >
              <div className="pg-hl-ring">
                <HighlightCover item={item} idx={idx} />
              </div>
              <span className="pg-hl-label">{item.title}</span>
              <span className="pg-hl-count">{item.storyCount} {item.storyCount === 1 ? "story" : "stories"}</span>
            </button>
          ))
        )}
        {!highlightsLoading && isOwnProfile && (
          <button type="button" className="pg-hl pg-hl--new" onClick={onOpenComposer}>
            <div className="pg-hl-ring">
              <div className="pg-hl-disc pg-hl-disc--new">+</div>
            </div>
            <span className="pg-hl-label">New</span>
            <span className="pg-hl-count">Add story</span>
          </button>
        )}
        {!highlightsLoading && !isOwnProfile && highlights.length === 0 && (
          <div className="pg-hl-empty">
            <IcArchive />
            <span>This profile has not added highlights.</span>
          </div>
        )}
      </div>
      {highlightError && <p className="pg-hl-error">{highlightError}</p>}
    </div>
  );
}
