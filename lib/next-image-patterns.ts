/**
 * Shared rules for `next/image`: remotePatterns (next.config) and when to skip the optimizer
 * (blob/data/unknown hosts). Uses NEXT_PUBLIC_* so the unoptimize helper works on the client.
 */

export type NextImageRemotePattern = {
  protocol: "http" | "https";
  hostname: string;
  port?: string;
  pathname?: string;
  search?: string;
};

function normalizeOriginPiece(raw: string): string {
  return raw.trim().replace(/\/$/, "");
}

/** Build `images.remotePatterns` from CDN base + allowlisted upload origins. */
export function getNextImageRemotePatterns(): NextImageRemotePattern[] {
  const out: NextImageRemotePattern[] = [];
  const seen = new Set<string>();

  const add = (protocol: "http" | "https", hostname: string) => {
    const h = hostname.trim().toLowerCase();
    if (!h) return;
    const key = `${protocol}://${h}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ protocol, hostname: h, pathname: "/**" });
  };

  const cdn = typeof process.env.NEXT_PUBLIC_MEDIA_CDN_BASE === "string"
    ? process.env.NEXT_PUBLIC_MEDIA_CDN_BASE.trim().replace(/\/$/, "")
    : "";
  if (cdn) {
    try {
      const u = new URL(cdn);
      add(u.protocol === "http:" ? "http" : "https", u.hostname);
    } catch {
      /* ignore */
    }
  }

  const list =
    typeof process.env.NEXT_PUBLIC_ALLOWED_UPLOAD_ORIGINS === "string"
      ? process.env.NEXT_PUBLIC_ALLOWED_UPLOAD_ORIGINS.split(",")
      : [];
  for (const piece of list) {
    const t = normalizeOriginPiece(piece);
    if (!t) continue;
    try {
      const u = new URL(t);
      add(u.protocol === "http:" ? "http" : "https", u.hostname);
    } catch {
      /* ignore */
    }
  }

  return out;
}

/**
 * Use `unoptimized` when Next cannot safely fetch/optimize the URL (blob, data, or host not in
 * remotePatterns). Same-origin `/…` paths are always optimized.
 */
export function shouldUnoptimizeNextImageSrc(src: string): boolean {
  const s = src.trim();
  if (!s) return true;
  if (s.startsWith("blob:") || s.startsWith("data:")) return true;
  if (s.startsWith("/")) return false;
  if (!/^https?:\/\//i.test(s)) return true;
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return false;

    const cdn = typeof process.env.NEXT_PUBLIC_MEDIA_CDN_BASE === "string"
      ? process.env.NEXT_PUBLIC_MEDIA_CDN_BASE.trim().replace(/\/$/, "")
      : "";
    if (cdn) {
      try {
        if (new URL(cdn).hostname.toLowerCase() === host) return false;
      } catch {
        /* ignore */
      }
    }

    const raw =
      typeof process.env.NEXT_PUBLIC_ALLOWED_UPLOAD_ORIGINS === "string"
        ? process.env.NEXT_PUBLIC_ALLOWED_UPLOAD_ORIGINS
        : "";
    for (const piece of raw.split(",")) {
      const t = normalizeOriginPiece(piece);
      if (!t) continue;
      try {
        if (new URL(t).hostname.toLowerCase() === host) return false;
      } catch {
        /* ignore */
      }
    }
    return true;
  } catch {
    return true;
  }
}
