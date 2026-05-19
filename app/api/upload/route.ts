import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getUser } from "@/lib/auth";
import {
  extensionForStoryMediaType,
  formatBytes,
  STORY_MEDIA_MAX_SIZE,
} from "@/lib/story-limits";
import { processUploadImage, stripRasterUploadMetadata, validateRasterImageUploadDimensions } from "@/lib/process-upload-image";
import {
  maybeStripVideoContainerMetadata,
  maybeTranscodeVideoToMp4,
  isFfmpegBinaryPresent,
  probeVideoDurationSeconds,
  uploadVideoMaxDurationSec,
} from "@/lib/transcode-video";
import { moderateUploadBeforePersist } from "@/lib/upload-moderation";
import { logBackgroundError } from "@/lib/logger";
import { validateUploadMagicBytes, type UploadMagicRole } from "@/lib/upload-magic-type";
import { consumeRateLimit } from "@/lib/rate-limit";
import { persistUserUpload } from "@/lib/uploads-storage";

const AVATAR_MEDIA_MAX_SIZE = 5 * 1024 * 1024;
const AVATAR_MEDIA_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const VOICE_MEDIA_MAX_SIZE = 8 * 1024 * 1024;
const VOICE_MEDIA_TYPE_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm"]);

/** Extensions we write (no leading dot). */
const STORAGE_EXTENSIONS = new Set([
  "gif", "webp", "jpg", "jpeg", "png", "mp4", "webm", "mov", "ogg", "m4a", "mp3", "wav",
  // E2EE media uses `.bin` since the payload is opaque AES-GCM ciphertext —
  // the server cannot identify the underlying mime type.
  "bin",
]);

function uploadRateLimitOpts(): { windowMs: number; max: number } {
  const w = Number.parseInt(process.env.UPLOAD_RATE_WINDOW_MS ?? `${60 * 60 * 1000}`, 10);
  const m = Number.parseInt(process.env.UPLOAD_RATE_MAX ?? "48", 10);
  return {
    windowMs: Number.isFinite(w) && w >= 60_000 ? w : 60 * 60 * 1000,
    max: Number.isFinite(m) && m >= 1 ? m : 48,
  };
}

function validStorageExtension(ext: string): boolean {
  const e = ext.toLowerCase().replace(/^\./, "");
  return /^[a-z0-9]{1,10}$/.test(e) && STORAGE_EXTENSIONS.has(e);
}

function extensionForAvatarMediaType(value?: string | null) {
  return value ? AVATAR_MEDIA_TYPE_EXTENSIONS[value] ?? null : null;
}

function extensionForVoiceMediaType(value?: string | null) {
  if (!value) return null;
  const base = (value.split(";")[0] ?? value).trim().toLowerCase();
  return VOICE_MEDIA_TYPE_EXTENSIONS[base] ?? null;
}

export async function POST(req: NextRequest) {
  const me = await getUser(req);
  if (!me) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const rate = await consumeRateLimit("upload:user", me.userId, uploadRateLimitOpts());
  if (!rate.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Form data is required." }, { status: 400 });

  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "A file is required." }, { status: 400 });

  const purpose = form.get("purpose");
  const isAvatarUpload = purpose === "avatar";
  const isVoiceUpload = purpose === "voice";
  const isE2eeMediaUpload = purpose === "e2ee-media";

  // E2EE media bypasses content-aware processing: the payload is AES-GCM
  // ciphertext the server cannot read, so magic-byte sniffing, raster
  // re-encoding, transcoding, and moderation all skip. Size + per-user rate
  // limit still apply so an attacker can't fill disk.
  if (isE2eeMediaUpload) {
    if (file.size <= 0) {
      return NextResponse.json({ error: "File cannot be empty." }, { status: 400 });
    }
    if (file.size > STORY_MEDIA_MAX_SIZE) {
      return NextResponse.json({ error: `File size must be ${formatBytes(STORY_MEDIA_MAX_SIZE)} or less.` }, { status: 400 });
    }
    const raw = Buffer.from(await file.arrayBuffer());
    const filename = `${randomUUID()}.bin`;
    try {
      const { url } = await persistUserUpload(raw, filename);
      return NextResponse.json({ url }, { status: 201 });
    } catch (err) {
      logBackgroundError("upload.persist.e2ee")(err);
      return NextResponse.json(
        { error: "Upload storage failed. Check UPLOAD_STORAGE and provider credentials." },
        { status: 503 },
      );
    }
  }

  let extension: string | null;
  if (isAvatarUpload) {
    extension = extensionForAvatarMediaType(file.type);
  } else if (isVoiceUpload) {
    extension = extensionForVoiceMediaType(file.type);
  } else {
    extension = extensionForStoryMediaType(file.type);
  }
  if (!extension) {
    return NextResponse.json({
      error: isAvatarUpload
        ? "Only JPG, PNG, WebP, and GIF avatar images are supported."
        : isVoiceUpload
          ? "Only WebM, OGG, MP4/M4A, MP3, and WAV audio is supported."
          : "Only JPG, PNG, WebP, GIF, MP4, MOV, and WebM files are supported.",
    }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: "File cannot be empty." }, { status: 400 });
  }

  const maxSize = isAvatarUpload ? AVATAR_MEDIA_MAX_SIZE : isVoiceUpload ? VOICE_MEDIA_MAX_SIZE : STORY_MEDIA_MAX_SIZE;
  if (file.size > maxSize) {
    return NextResponse.json({ error: `File size must be ${formatBytes(maxSize)} or less.` }, { status: 400 });
  }

  const raw = Buffer.from(await file.arrayBuffer());

  let magicRole: UploadMagicRole;
  if (isVoiceUpload) magicRole = "voice_audio";
  else if (!isAvatarUpload && VIDEO_EXTENSIONS.has(extension)) magicRole = "story_video";
  else magicRole = "story_image";

  const magic = await validateUploadMagicBytes(raw, file.type, magicRole);
  if (!magic.ok) {
    return NextResponse.json({ error: magic.error }, { status: 400 });
  }

  let outBuffer = raw;
  let outExtension = extension;
  /** When true, FFmpeg already produced MP4 (`-map_metadata -1`), skip remux. */
  let videoTranscodedOk = false;

  if (!isVoiceUpload && (file.type.startsWith("image/") || ["jpg", "png", "webp", "gif"].includes(extension))) {
    const dim = await validateRasterImageUploadDimensions(raw, file.type);
    if (!dim.ok) return NextResponse.json({ error: dim.error }, { status: 400 });
    let rasterProcessedOk = false;
    try {
      const processed = await processUploadImage(raw, file.type, isAvatarUpload ? "avatar" : "story");
      outBuffer = Buffer.from(processed.buffer);
      outExtension = processed.extension;
      rasterProcessedOk = true;
    } catch (err) {
      logBackgroundError("upload.processImage")(err);
    }
    if (!rasterProcessedOk) {
      const strippedMeta = await stripRasterUploadMetadata(raw, file.type);
      if (strippedMeta) {
        outBuffer = Buffer.from(strippedMeta);
      }
    }
  } else if (!isAvatarUpload && !isVoiceUpload && VIDEO_EXTENSIONS.has(extension)) {
    if (isFfmpegBinaryPresent()) {
      const probed = await probeVideoDurationSeconds(raw, extension);
      if (probed === null) {
        return NextResponse.json(
          { error: "Could not read this video's duration. It may be corrupt or unsupported." },
          { status: 400 },
        );
      }
      const maxDur = uploadVideoMaxDurationSec();
      if (probed > maxDur) {
        return NextResponse.json(
          {
            error: `Video must be ${maxDur} seconds or shorter (${Math.ceil(probed)}s detected).`,
          },
          { status: 400 },
        );
      }
    }
    try {
      const transcoded = await maybeTranscodeVideoToMp4(raw, extension);
      if (transcoded) {
        outBuffer = Buffer.from(transcoded.buffer);
        outExtension = transcoded.extension;
        videoTranscodedOk = true;
      }
    } catch (err) {
      logBackgroundError("upload.transcodeVideo")(err);
    }
  }

  if (!isVoiceUpload && VIDEO_EXTENSIONS.has(outExtension.toLowerCase()) && !videoTranscodedOk) {
    const remuxed = await maybeStripVideoContainerMetadata(outBuffer, outExtension.toLowerCase());
    if (remuxed) {
      outBuffer = Buffer.from(remuxed);
    }
  }

  if (!validStorageExtension(outExtension)) {
    return NextResponse.json({ error: "Invalid storage file extension." }, { status: 400 });
  }

  const filename = `${randomUUID()}.${outExtension}`;

  const moderation = await moderateUploadBeforePersist({
    userId: me.userId,
    buffer: outBuffer,
    mime: file.type,
    extension: outExtension,
    purpose: isAvatarUpload ? "avatar" : isVoiceUpload ? "voice" : "story",
  });
  if (!moderation.ok) {
    return NextResponse.json({ error: moderation.message }, { status: 422 });
  }

  try {
    const { url } = await persistUserUpload(outBuffer, filename);
    return NextResponse.json({ url }, { status: 201 });
  } catch (err) {
    logBackgroundError("upload.persist")(err);
    return NextResponse.json(
      { error: "Upload storage failed. Check UPLOAD_STORAGE and provider credentials." },
      { status: 503 },
    );
  }
}
