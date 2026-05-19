"use client";

import { IcHeart, IcMsg, IcPin, IcSave } from "./create-primitives";

export function CreatePostPreview({
  previews,
  activeIdx,
  isVideoAt,
  activeRatio,
  caption,
  location,
  meDisplayName,
  meUsername,
  initials,
}: {
  previews: string[];
  activeIdx: number;
  isVideoAt: (i: number) => boolean;
  activeRatio: string;
  caption: string;
  location: string;
  meDisplayName: string | undefined;
  meUsername: string | undefined;
  initials: string;
}) {
  const activeSrc = previews[activeIdx];
  return (
    <div className="st-cprev">
      <div className="st-cprev-bar" />
      {previews.length > 0 && activeSrc ? (
        <div className="st-cprev-img" style={{ aspectRatio: activeRatio }}>
          {isVideoAt(activeIdx) ? (
            <video src={activeSrc} className="st-media" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={activeSrc} className="st-media" alt="" />
          )}
          {previews.length > 1 ? (
            <span className="st-cprev-count">{previews.length} photos</span>
          ) : null}
        </div>
      ) : (
        <div className="st-cprev-placeholder">
          <span>Preview will appear here</span>
        </div>
      )}
      {(caption || location) ? (
        <div className="st-cprev-body">
          {caption ? <p className="st-cprev-caption">{caption.slice(0, 120)}{caption.length > 120 ? "…" : ""}</p> : null}
          {location ? <p className="st-cprev-loc"><IcPin /> {location}</p> : null}
        </div>
      ) : null}
      <div className="st-cprev-footer">
        <div className="st-cprev-author">
          <div className="st-cprev-av">{initials}</div>
          <div>
            <div className="st-cprev-name">{meDisplayName ?? "You"}</div>
            <div className="st-cprev-uname">@{meUsername ?? "…"}</div>
          </div>
        </div>
        <div className="st-cprev-actions">
          <span className="st-cprev-ic"><IcHeart /></span>
          <span className="st-cprev-ic"><IcMsg /></span>
          <span className="st-cprev-ic"><IcSave /></span>
        </div>
      </div>
    </div>
  );
}
