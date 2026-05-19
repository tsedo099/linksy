import "server-only";
import sharp from "sharp";

export type ProcessImagePurpose = "avatar" | "story";

const MAX_EDGE_OUT: Record<ProcessImagePurpose, number> = {
  avatar: 512,
  story: 2048,
};

const WEBP_QUALITY = 82;

/** Match Sharp / GIF branch: ~16384²; blocks pathological pixel counts before full decode. */
const DEFAULT_INPUT_LIMIT_PIXELS = 268_402_689;
const DEFAULT_INPUT_MAX_EDGE_PX = 8192;

function uploadImageLimitPixels(): number {
  const raw = process.env.UPLOAD_IMAGE_MAX_PIXELS?.trim();
  if (!raw) return DEFAULT_INPUT_LIMIT_PIXELS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1_000_000 ? n : DEFAULT_INPUT_LIMIT_PIXELS;
}

function uploadImageMaxEdgePx(): number {
  const raw = process.env.UPLOAD_IMAGE_MAX_EDGE_PX?.trim();
  if (!raw) return DEFAULT_INPUT_MAX_EDGE_PX;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 512 && n <= 16_384 ? n : DEFAULT_INPUT_MAX_EDGE_PX;
}

/** Reject decompress/memory bombs (oversized raster metadata) before `processUploadImage`. */
export async function validateRasterImageUploadDimensions(
  buffer: Buffer,
  mime: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!mime.startsWith("image/")) return { ok: true };

  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowed.has(mime)) return { ok: true };

  const limitPx = uploadImageLimitPixels();
  const maxEdge = uploadImageMaxEdgePx();

  try {
    const meta = await sharp(buffer, {
      limitInputPixels: limitPx,
      ...(mime === "image/gif" ? { animated: true } : {}),
    }).metadata();

    const w = meta.width ?? 0;
    const h = meta.height ?? 0;

    if (w <= 0 || h <= 0) {
      return { ok: false, error: "Could not read image dimensions — the file may be corrupt." };
    }

    if (w > maxEdge || h > maxEdge) {
      return {
        ok: false,
        error: `Images must be at most ${maxEdge}×${maxEdge} pixels (this file is ${w}×${h}).`,
      };
    }

    if (mime === "image/gif" && typeof meta.pages === "number" && meta.pages > 1) {
      const footprint = (meta.width ?? 0) * (meta.height ?? 0) * meta.pages;
      if (footprint > limitPx) {
        return {
          ok: false,
          error: "Animated image frame count × resolution is too large — try fewer frames or a smaller size.",
        };
      }
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/exceeds|exceed\s+.*pixel|Input image exceeds|maximum .*pixel/i.test(msg)) {
      return { ok: false, error: "Image resolution or pixel count is too large." };
    }
    return { ok: false, error: "Could not read this image — try another file." };
  }
}

/** Raster images only (GIF treated separately). Caller checks mime. */
export async function processUploadImage(buffer: Buffer, mime: string, purpose: ProcessImagePurpose) {
  const maxEdge = MAX_EDGE_OUT[purpose];
  const limitPx = uploadImageLimitPixels();

  if (mime === "image/gif") {
    const processed = await sharp(buffer, {
      animated: true,
      limitInputPixels: limitPx,
      pages: -1,
    })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .gif()
      .toBuffer();

    return { buffer: processed, extension: "gif" as const, mime: "image/gif" };
  }

  const processed = await sharp(buffer, { limitInputPixels: limitPx })
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  return { buffer: processed, extension: "webp" as const, mime: "image/webp" };
}

/** Re-encode in the same MIME family to strip EXIF / ICC / container comments (fallback when `processUploadImage` throws). */
export async function stripRasterUploadMetadata(buffer: Buffer, mime: string): Promise<Buffer | null> {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowed.has(mime)) return null;

  const limitPx = uploadImageLimitPixels();
  try {
    if (mime === "image/gif") {
      return await sharp(buffer, {
        animated: true,
        limitInputPixels: limitPx,
        pages: -1,
      })
        .rotate()
        .gif()
        .toBuffer();
    }

    const base = sharp(buffer, { limitInputPixels: limitPx }).rotate();
    if (mime === "image/jpeg") return await base.jpeg({ mozjpeg: true, quality: 92 }).toBuffer();
    if (mime === "image/png") return await base.png({ compressionLevel: 9 }).toBuffer();
    if (mime === "image/webp") return await base.webp({ quality: 92 }).toBuffer();
    return null;
  } catch {
    return null;
  }
}
