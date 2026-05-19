/**
 * Canonical site URL for `metadataBase`, Open Graph, and any other absolute
 * URL we publish for crawlers.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_APP_URL` — primary, set in production and staging
 *   2. `VERCEL_URL` — Vercel injects this for preview deployments (no scheme)
 *   3. `http://localhost:3000` — dev fallback so `metadataBase: new URL(...)`
 *      doesn't throw during `next build` on a developer machine
 *
 * The result is always a `URL` so callers can do `new URL("/x", siteUrl())`
 * without juggling trailing slashes.
 */

const DEFAULT_DEV_URL = "http://localhost:3000";

export function siteUrl(): URL {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv);
    } catch {
      /* fall through */
    }
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const candidate = vercel.startsWith("http") ? vercel : `https://${vercel}`;
    try {
      return new URL(candidate);
    } catch {
      /* fall through */
    }
  }
  return new URL(DEFAULT_DEV_URL);
}

/**
 * Build an absolute URL for `path` (which may be a path or a fully-qualified URL).
 * Returns the canonical site origin + path joined safely.
 */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = siteUrl();
  // Use `URL` constructor so we never end up with double slashes / missing slashes.
  return new URL(path.startsWith("/") ? path : `/${path}`, base).toString();
}

/**
 * Default `metadataBase` value — wired into the root layout so per-page
 * `openGraph.images: ["/foo.png"]` resolve relative to the production origin
 * rather than `localhost`.
 */
export const SITE_METADATA_BASE = siteUrl();
