import "server-only";
import { spawn } from "child_process";
import { createHash } from "crypto";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { logBackgroundError } from "@/lib/logger";

export type UploadModerationPurpose = "avatar" | "story" | "voice";

type ModerationMode = "off" | "clamav" | "webhook" | "clamav_webhook";

function moderationMode(): ModerationMode {
  const raw = (process.env.UPLOAD_MODERATION_MODE ?? "").trim().toLowerCase();
  if (raw === "clamav" || raw === "webhook" || raw === "clamav_webhook") return raw;
  return "off";
}

/**
 * Optional NSFW/malware pipeline before storage.
 * `UPLOAD_MODERATION_MODE=off` — no-op (default).
 * `clamav` — spawn `UPLOAD_CLAMSCAN_PATH` (default `clamscan`) on temp file (exit **1** = infected / blocked).
 * `webhook` — POST JSON to `UPLOAD_MODERATION_WEBHOOK_URL` (see ModerationWebhookPayload).
 * `clamav_webhook` — clamav then webhook.
 */
export async function moderateUploadBeforePersist(args: {
  userId: string;
  buffer: Buffer;
  mime: string;
  extension: string;
  purpose: UploadModerationPurpose;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const mode = moderationMode();
  if (mode === "off") return { ok: true };

  const sha256 = createHash("sha256").update(args.buffer).digest("hex");

  if (mode === "clamav" || mode === "clamav_webhook") {
    const c = await runClamAvScan(args.buffer, args.extension);
    if (!c.ok) return c;
  }

  if (mode === "webhook" || mode === "clamav_webhook") {
    const w = await runModerationWebhook({
      sha256,
      sizeBytes: args.buffer.length,
      mime: args.mime,
      extension: args.extension,
      purpose: args.purpose,
      userId: args.userId,
    });
    if (!w.ok) return w;
  }

  return { ok: true };
}

type WebhookPayload = {
  sha256: string;
  sizeBytes: number;
  mime: string;
  extension: string;
  purpose: UploadModerationPurpose;
  userId: string;
};

async function runModerationWebhook(payload: WebhookPayload): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = process.env.UPLOAD_MODERATION_WEBHOOK_URL?.trim();
  if (!url || !/^https:\/\/.+/i.test(url)) {
    return { ok: false, message: "Upload moderation webhook is misconfigured (UPLOAD_MODERATION_WEBHOOK_URL)." };
  }

  const secret = process.env.UPLOAD_MODERATION_WEBHOOK_SECRET?.trim();
  const abortMs = Math.min(Math.max(Number.parseInt(process.env.UPLOAD_MODERATION_WEBHOOK_TIMEOUT_MS ?? "8000", 10) || 8000, 1000), 60_000);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), abortMs);
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (secret) headers.Authorization = `Bearer ${secret}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: ctrl.signal,
      body: JSON.stringify(payload),
    });
    clearTimeout(t);
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, message: typeof body.reason === "string" ? body.reason : "Moderation service rejected upload." };
    }

    const allowExplicit =
      typeof body.allow === "boolean" ? body.allow : typeof body.allowed === "boolean" ? body.allowed : undefined;
    const flaggedBad = body.nsfw === true || body.malicious === true;

    if (allowExplicit === false) {
      const reason = typeof body.reason === "string" ? body.reason : "This upload cannot be accepted.";
      return { ok: false, message: reason };
    }
    if (flaggedBad && allowExplicit !== true) {
      const reason = typeof body.reason === "string" ? body.reason : "Moderation flagged this upload.";
      return { ok: false, message: reason };
    }
    return { ok: true };
  } catch (err) {
    logBackgroundError("uploadModeration.webhook")(err);
    return { ok: false, message: "Moderation check failed temporarily. Try again soon." };
  }
}

async function runClamAvScan(buffer: Buffer, extension: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const exeRaw = process.env.UPLOAD_CLAMSCAN_PATH?.trim();
  /** Windows/Linux: explicit path recommended; POSIX default `clamscan`. */
  const exe = exeRaw && exeRaw.length > 0 ? exeRaw : "clamscan";

  const dir = await mkdtemp(join(tmpdir(), "linksy-clam-"));
  const inPath = join(dir, `scan.${extension.replace(/[^\w]/g, "") || "bin"}`);
  try {
    await writeFile(inPath, buffer);
    const code = await spawnExitCode(exe, ["--no-summary", inPath], 120_000);
    /** clamscan: 0 clean, 1 infected, 2+ error */
    if (code === null) return { ok: false, message: "Could not run virus scan on this upload." };
    if (code === 1) return { ok: false, message: "This file was blocked by the virus scanner." };
    if (code !== 0) return { ok: false, message: "Virus scanning failed — try another file." };
    return { ok: true };
  } catch (err) {
    logBackgroundError("uploadModeration.clamav")(err);
    return { ok: false, message: "Could not run virus scan on this upload." };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function spawnExitCode(cmd: string, args: string[], timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let finished = false;
    const tid = setTimeout(() => {
      if (finished) return;
      finished = true;
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve(null);
    }, timeoutMs);
    child.on("error", () => {
      if (finished) return;
      finished = true;
      clearTimeout(tid);
      resolve(null);
    });
    child.on("close", (c) => {
      if (finished) return;
      finished = true;
      clearTimeout(tid);
      resolve(c ?? null);
    });
  });
}
