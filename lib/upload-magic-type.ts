import "server-only";
import { fileTypeFromBuffer } from "file-type";

export type UploadMagicRole =
  /** Avatar + story raster uploads (GIF / WebP etc.) */
  | "story_image"
  /** Story/post video containers */
  | "story_video"
  /** Voice / chat audio blobs */
  | "voice_audio";

const IMAGE_DETECTED = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const VIDEO_DETECTED = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

/** Some recorders mux WebM with a video/webm MIME even for audio-only. */
const VOICE_DETECTED = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/x-m4a",
  "video/webm",
]);

function allowedDetected(role: UploadMagicRole): Set<string> {
  if (role === "story_image") return IMAGE_DETECTED;
  if (role === "story_video") return VIDEO_DETECTED;
  return VOICE_DETECTED;
}

function normalizeMime(value: string): string {
  return (value.split(";")[0] ?? value).trim().toLowerCase();
}

/**
 * Validates magic bytes (`file-type`) against declared Content-Type before processing.
 */
export async function validateUploadMagicBytes(
  buffer: Buffer,
  declaredMimeRaw: string | undefined | null,
  role: UploadMagicRole,
): Promise<{ ok: true; detectedMime: string } | { ok: false; error: string }> {
  const declared = declaredMimeRaw ? normalizeMime(declaredMimeRaw) : "";
  const head = buffer.subarray(0, Math.min(buffer.length, 65536));
  const detected = await fileTypeFromBuffer(head);
  const detectedMime = detected?.mime ?? "";

  if (!detectedMime) {
    return {
      ok: false,
      error: "Uploaded file format could not be verified. Try a standard JPG, PNG, GIF, WebP, MP4, MOV, WebM, or supported audio upload.",
    };
  }

  const allowed = allowedDetected(role);
  if (!allowed.has(detectedMime)) {
    return { ok: false, error: "File contents do not match an allowed upload type." };
  }

  if (declared) {
    /** Declared MIME should align with sniffed type (relax common aliases). */
    const okAliases: Array<[string, string]> = [
      ["audio/mp4", "video/mp4"],
      ["audio/x-m4a", "audio/mp4"],
      ["audio/x-wav", "audio/wav"],
      ["audio/wave", "audio/wav"],
      ["image/jpg", "image/jpeg"],
    ];
    const compatible =
      normalizeMime(declared) === normalizeMime(detectedMime)
      || okAliases.some(
        ([a, b]) =>
          (declared.startsWith(a) && detectedMime === b)
          || (declared.startsWith(b) && detectedMime === a),
      );

    /** Voice WebM declares often use audio/webm while sniff is video/webm. */
    const voiceWebmLoose =
      role === "voice_audio"
      && declared.startsWith("audio/webm")
      && detectedMime === "video/webm";

    if (!compatible && !voiceWebmLoose) {
      return { ok: false, error: "Declared file type does not match actual file contents." };
    }
  }

  return { ok: true, detectedMime };
}
