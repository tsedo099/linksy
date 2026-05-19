import { isTrustedUserUploadUrl, resolvePublicMediaUrl as resolvePublicUploadUrlImpl } from "@/lib/upload-url";

export { resolvePublicUploadUrlImpl as resolvePublicMediaUrl };

/** For `<img>` / `<video>` / `<audio>`: rewrites stored `/uploads/…` URLs when `NEXT_PUBLIC_MEDIA_CDN_BASE` is set. */
export function displayMediaSrc(url?: string | null): string | undefined {
  const value = getMediaUrl(url);
  if (!value) return undefined;
  return resolvePublicUploadUrlImpl(value) ?? value;
}

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)(?:[?#].*)?$/i;
const AUDIO_ONLY_EXT_RE = /\.(mp3|m4a|aac|wav|oga|ogg)(?:[?#].*)?$/i;
const VOICE_HASH_RE = /#waveform=([\w,.-]+)/i;

export function getMediaUrl(url?: string | null): string | null {
  const value = url?.trim();
  return value ? value : null;
}

export function isRenderableMediaUrl(url?: string | null): boolean {
  const value = getMediaUrl(url);
  if (!value) return false;

  return (
    value.startsWith("/") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("blob:") ||
    value.startsWith("data:")
  );
}

export function isAudioMediaUrl(url?: string | null): boolean {
  const value = getMediaUrl(url);
  if (!value) return false;
  return AUDIO_ONLY_EXT_RE.test(value) || VOICE_HASH_RE.test(value);
}

export function isVideoMediaUrl(url?: string | null): boolean {
  const value = getMediaUrl(url);
  if (!value) return false;
  if (isAudioMediaUrl(value)) return false;
  return VIDEO_EXT_RE.test(value);
}

export function isImageMediaUrl(url?: string | null): boolean {
  if (!isRenderableMediaUrl(url)) return false;
  return !isVideoMediaUrl(url) && !isAudioMediaUrl(url);
}

export function isUploadedMediaUrl(url?: string | null): boolean {
  return isTrustedUserUploadUrl(getMediaUrl(url));
}

export function extractVoiceWaveform(url?: string | null): number[] | null {
  const value = getMediaUrl(url);
  if (!value) return null;
  const match = value.match(VOICE_HASH_RE);
  if (!match) return null;
  const captured = match[1];
  if (captured === undefined) return null;
  const peaks = captured.split(",").map((piece) => Number.parseFloat(piece));
  if (peaks.some((peak) => !Number.isFinite(peak))) return null;
  return peaks;
}

export function stripVoiceWaveform(url?: string | null): string | null {
  const value = getMediaUrl(url);
  if (!value) return null;
  return value.replace(VOICE_HASH_RE, "").replace(/#$/, "");
}

export type PrimaryMediaKind = "image" | "video" | "none";

/** Uses first recognizable URL in mediaUrls (typical carousel lead). */
export function primaryMediaKind(mediaUrls: string[]): PrimaryMediaKind {
  for (const url of mediaUrls) {
    const v = getMediaUrl(url);
    if (!v) continue;
    if (isVideoMediaUrl(v)) return "video";
    if (isImageMediaUrl(v)) return "image";
  }
  return "none";
}
