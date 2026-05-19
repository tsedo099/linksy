/** Client + server — trusted uploads and optional CDN rewrite for `/uploads/*`. */

export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, "");
}

/**
 * Absolute origins (scheme + host) that may serve user uploads (Blob, R2 pub URL, CloudFront…).
 * Set `NEXT_PUBLIC_ALLOWED_UPLOAD_ORIGINS=https://acct.blob.vercel-storage.com,https://pub-xxx.r2.dev`.
 */
export function getTrustedUploadOrigins(): string[] {
  const raw =
    typeof process.env.NEXT_PUBLIC_ALLOWED_UPLOAD_ORIGINS === "string"
      ? process.env.NEXT_PUBLIC_ALLOWED_UPLOAD_ORIGINS
      : "";
  return raw.split(",").map((s) => normalizeOrigin(s)).filter(Boolean);
}

/**
 * Prefix for same-origin `/uploads/...` when a CDN terminates that path (`https://static.example`).
 * Stored DB rows stay relative; callers rewrite at render-time.
 */
export function getMediaCdnBase(): string | null {
  const raw =
    typeof process.env.NEXT_PUBLIC_MEDIA_CDN_BASE === "string"
      ? process.env.NEXT_PUBLIC_MEDIA_CDN_BASE.trim().replace(/\/$/, "")
      : "";
  return raw.length > 0 ? raw : null;
}

/** Readable URL for post/story/message media (`<img src=…>` / `<video src=…>`). */
export function resolvePublicMediaUrl(url?: string | null): string | null {
  const v = url?.trim();
  if (!v) return null;
  const cdn = getMediaCdnBase();
  if (!cdn || !v.startsWith("/uploads/")) return v;

  /** Preserve `#waveform=…` and query strings attached to canonical paths. */
  const hashIdx = v.indexOf("#");
  const queryIdx = v.indexOf("?");
  let pivot = v.length;
  if (hashIdx >= 0) pivot = Math.min(pivot, hashIdx);
  if (queryIdx >= 0) pivot = Math.min(pivot, queryIdx);

  const pathOnly = pivot < v.length ? v.slice(0, pivot) : v;
  const suffix = pivot < v.length ? v.slice(pivot) : "";
  return `${cdn}${pathOnly}${suffix}`;
}

/**
 * True if the URL is our own `/uploads/…` route or HTTPS under an explicitly allowlisted CDN origin.
 */
export function isTrustedUserUploadUrl(url?: string | null): boolean {
  const v = url?.trim();
  if (!v) return false;

  if (v.startsWith("/uploads/")) {
    try {
      const pathname = new URL(v, "https://example.com").pathname;
      const parts = pathname.split("/").filter(Boolean);
      return parts.length === 2 && parts[0] === "uploads" && /^[^/\\]+$/.test(parts[1] ?? "");
    } catch {
      return false;
    }
  }

  if (!v.startsWith("https://")) return false;

  try {
    const parsed = new URL(v);
    if (parsed.username || parsed.password) return false;
    /** Reject suspicious path escapes in absolute URLs */
    const segs = parsed.pathname.split("/").filter(Boolean);
    if (segs.some((s) => s === ".." || s.includes("\\"))) return false;
    const origins = getTrustedUploadOrigins();
    if (!origins.length) return false;
    return origins.includes(normalizeOrigin(parsed.origin));
  } catch {
    return false;
  }
}

/** Last path segment (`uuid.ext`) for a trusted `/uploads/…` or allowlisted HTTPS URL. */
export function extractTrustedUploadBasename(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;

  try {
    if (raw.startsWith("/uploads/")) {
      const pathname = new URL(raw, "https://example.com").pathname;
      const segs = pathname.split("/").filter(Boolean);
      if (segs.length !== 2 || segs[0] !== "uploads") return null;
      const name = decodeURIComponent(segs[1] ?? "");
      if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
      return name;
    }

    const u = new URL(raw);
    if (!raw.startsWith("https://")) return null;

    const lastEncoded = u.pathname.split("/").filter(Boolean).pop();
    if (!lastEncoded) return null;
    const last = decodeURIComponent(lastEncoded);
    if (!last || last.includes("..") || /[/\\]/.test(last)) return null;
    return isTrustedUserUploadUrl(raw) ? last : null;
  } catch {
    return null;
  }
}
