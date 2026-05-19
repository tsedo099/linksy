import { sanitizePlainText } from "@/lib/sanitize-html";

/**
 * Phrases that appear together in the main feed shell (nav / chrome). When many of
 * these show up in a stored caption, it almost always means a whole-page paste or
 * accessibility-tree dump — not intentional post copy.
 */
const FEED_CHROME_MARKERS = [
  "linksy logo",
  "your avatar",
  "architect feed",
  "home base",
  "intel streams",
  "active streams",
  "⚡ creator mode",
  "creator mode",
  "close circle",
] as const;

function markerHitCount(lower: string): number {
  let n = 0;
  for (const m of FEED_CHROME_MARKERS) {
    if (lower.includes(m)) n += 1;
  }
  return n;
}

/**
 * Strips accidental feed-chrome dumps from captions for API responses / UI.
 * Returns null when nothing readable remains.
 */
export function scrubFeedCaptionForViewer(caption: string | null | undefined): string | null {
  if (caption == null) return null;
  let s = sanitizePlainText(String(caption)).trim();
  if (!s) return null;

  const lower = s.toLowerCase();
  const hits = markerHitCount(lower);
  const looksLikeChromeDump = hits >= 3 && s.length >= 72;

  if (!looksLikeChromeDump) return s;

  for (const m of FEED_CHROME_MARKERS) {
    const re = new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    s = s.replace(re, " ");
  }
  s = s
    .replace(/\b(for you|following)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (s.length < 2) return null;
  return s;
}
