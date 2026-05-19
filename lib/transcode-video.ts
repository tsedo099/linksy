import "server-only";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const DISABLE = process.env.VIDEO_TRANSCODE === "0" || process.env.VIDEO_TRANSCODE === "false";

/** FFmpeg binary for probing / transcoding (may be overridden by `FFMPEG_PATH`). */
function ffmpegBinPath(): string | null {
  const bundled = typeof ffmpegPath === "string" && ffmpegPath.length > 0 ? ffmpegPath : null;
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  return bundled ?? fromEnv ?? null;
}

function ffmpegExecutable(): string | null {
  if (DISABLE) return null;
  return ffmpegBinPath();
}

/** True when the bundled or `FFMPEG_PATH` binary exists (used to decide if we can probe duration). */
export function isFfmpegBinaryPresent(): boolean {
  return Boolean(ffmpegBinPath());
}

/** Standardize uploads to MP4 (H.264 + AAC). Returns null if FFmpeg unavailable or transcoding skipped / fails. */
export async function maybeTranscodeVideoToMp4(
  buffer: Buffer,
  extension: string,
): Promise<{ buffer: Buffer; extension: "mp4"; mime: "video/mp4" } | null> {
  const exe = ffmpegExecutable();
  if (!exe) return null;

  const videoExtensions = new Set(["mp4", "mov", "webm"]);
  if (!videoExtensions.has(extension.toLowerCase())) {
    return null;
  }

  const dir = await mkdtemp(join(tmpdir(), "linksy-video-"));
  const inputPath = join(dir, `input.${extension}`);
  const outputPath = join(dir, "out.mp4");

  try {
    await writeFile(inputPath, buffer);

    const code = await runFfmpeg(exe, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-map_metadata",
      "-1",
      "-vf",
      "scale='min(1280\\,iw)':-2",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "23",
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outputPath,
    ]);

    if (code !== 0) {
      return null;
    }

    const outBuf = await readFile(outputPath);
    if (!outBuf.length) return null;
    return { buffer: outBuf, extension: "mp4", mime: "video/mp4" };
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Remux with `-codec copy` dropping container metadata (`location=`, XMP, …). */
export async function maybeStripVideoContainerMetadata(
  buffer: Buffer,
  extension: string,
): Promise<Buffer | null> {
  const exe = ffmpegBinPath();
  if (!exe) return null;

  const ext = extension.toLowerCase();
  const supported = new Set(["mp4", "mov", "webm"]);
  if (!supported.has(ext)) return null;

  const dir = await mkdtemp(join(tmpdir(), "linksy-video-metastrip-"));
  const inputPath = join(dir, `in.${ext}`);
  const outSuffix = ext === "webm" ? "webm" : ext === "mov" ? "mov" : "mp4";
  const outputPath = join(dir, `out.${outSuffix}`);

  try {
    await writeFile(inputPath, buffer);
    const args: string[] = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-codec",
      "copy",
      "-map_metadata",
      "-1",
    ];
    if (outSuffix === "mp4" || outSuffix === "mov") {
      args.push("-movflags", "+faststart");
    }
    args.push(outputPath);

    const code = await runFfmpeg(exe, args);
    if (code !== 0) return null;

    const outBuf = await readFile(outputPath);
    return outBuf.length ? outBuf : null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runFfmpeg(exe: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, { windowsHide: true });
    child.on("error", () => resolve(1));
    child.on("close", (c) => resolve(c ?? 1));
  });
}



function parseHoursToSeconds(h: number, m: number, s: number): number {
  if (![h, m, s].every((x) => Number.isFinite(x))) return NaN;
  return h * 3600 + m * 60 + s;
}

/** Max playable length seconds for uploaded video/story clips (blocks multi-hour uploads). Override with `UPLOAD_VIDEO_MAX_DURATION_SEC`. */
export function uploadVideoMaxDurationSec(): number {
  const raw = process.env.UPLOAD_VIDEO_MAX_DURATION_SEC ?? `${5 * 60}`;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 5) return 5 * 60;
  /** Hard ceiling so env cannot be set absurdly high; raise here if product needs longer reels. */
  return Math.min(n, 7200);
}

/** Read container duration via `ffmpeg -i` (parses stderr; exits early; no decode). Returns null if FFmpeg missing or unreadable. */
export async function probeVideoDurationSeconds(buffer: Buffer, extension: string): Promise<number | null> {
  const exe = ffmpegBinPath();
  if (!exe) return null;

  const videoExtensions = new Set(["mp4", "mov", "webm"]);
  if (!videoExtensions.has(extension.toLowerCase())) {
    return null;
  }

  const dir = await mkdtemp(join(tmpdir(), "linksy-video-probe-"));
  const inputPath = join(dir, `input.${extension}`);

  try {
    await writeFile(inputPath, buffer);
    return await ffmpegProbeDurationFromStderr(exe, inputPath);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function ffmpegProbeDurationFromStderr(exe: string, inputPath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(exe, ["-hide_banner", "-i", inputPath], { windowsHide: true });

    const chunks: Buffer[] = [];
    let done = false;
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    child.stderr?.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const text = Buffer.concat(chunks).toString("utf8");
      const hit = matchDurationSeconds(text);
      if (hit !== null) finish(hit);
    });

    child.on("error", () => finish(null));
    child.on("close", () => {
      finish(matchDurationSeconds(Buffer.concat(chunks).toString("utf8")));
    });
  });
}

/** Returns best-known duration (seconds), or null if no `HH:MM:SS.ms` durations found in stderr. */
function matchDurationSeconds(stderr: string): number | null {
  let best: number | null = null;
  const re = /Duration:\s*(\d+):(\d+):([\d.]+)/g;
  let match: RegExpExecArray | null;
  match = re.exec(stderr);
  while (match !== null) {
    const sec = parseHoursToSeconds(Number(match[1]), Number(match[2]), Number(match[3]));
    if (Number.isFinite(sec) && sec >= 0 && (best === null || sec > best)) best = sec;
    match = re.exec(stderr);
  }
  return best;
}
