"use client";

import { isVideoMediaUrl } from "@/lib/media";

export { uploadUserMedia } from "@/lib/create-media-upload";

export type StoryMediaLoadState = "idle" | "loading" | "ready" | "error";

type StoryMediaCanvasPreviewProps = {
  mediaPreview: string | null;
  mediaFile: File | null;
  mediaAlt: string;
  mediaLoadState: StoryMediaLoadState;
  onVideoLoaded: () => void;
  onVideoError: () => void;
  onImageLoad: () => void;
  onImageError: () => void;
};

/** Story modal canvas: single image/video preview with loading + error overlay. */
export function StoryMediaCanvasPreview({
  mediaPreview,
  mediaFile,
  mediaAlt,
  mediaLoadState,
  onVideoLoaded,
  onVideoError,
  onImageLoad,
  onImageError,
}: StoryMediaCanvasPreviewProps) {
  if (!mediaPreview) return null;
  const mediaIsVideo = Boolean(mediaFile?.type.startsWith("video/") || isVideoMediaUrl(mediaPreview));

  return (
    <>
      {mediaIsVideo ? (
        <video
          className="se-media-preview"
          src={mediaPreview}
          autoPlay
          muted
          loop
          playsInline
          onLoadedData={onVideoLoaded}
          onError={onVideoError}
        />
      ) : (
        <img
          className="se-media-preview"
          src={mediaPreview}
          alt={mediaAlt || "Story media preview"}
          onLoad={onImageLoad}
          onError={onImageError}
        />
      )}
      {mediaLoadState === "loading" ? <div className="se-media-state">Loading media...</div> : null}
      {mediaLoadState === "error" ? (
        <div className="se-media-state se-media-state--error">Could not load media</div>
      ) : null}
    </>
  );
}
