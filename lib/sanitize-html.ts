import DOMPurify from "isomorphic-dompurify";

/** Plain user text — strips tags/scripts; preserves visible text inside tags. */
const PLAIN_ONLY = {
  ALLOWED_TAGS: [] as string[],
  ALLOWED_ATTR: [] as string[],
  KEEP_CONTENT: true,
};

/** Locked-down snippet if captions ever allow markup. */
const RICH_DEFAULT = {
  ALLOWED_TAGS: ["b", "i", "em", "strong", "br", "p", "a"] as string[],
  ALLOWED_ATTR: ["href", "target", "rel"] as string[],
  ALLOW_DATA_ATTR: false as const,
};

/** Use for captions, bios, chat, comments — HTML does not survive. */
export function sanitizePlainText(input: string): string {
  return DOMPurify.sanitize(input, PLAIN_ONLY);
}

export function sanitizeRestrictedHtmlFragment(input: string): string {
  return DOMPurify.sanitize(input, RICH_DEFAULT);
}
