/**
 * Lightweight heuristic to flag a message body as containing adult content.
 *
 * **Not a content classifier.** This is a server-side double-check that fires
 * on a small list of high-signal English + Mongolian terms so a missed
 * "Contains adult content" composer toggle still trips the gate. Anything
 * subtler — context-aware classification, image inspection — would need a
 * managed service (Perspective API, AWS Rekognition, etc.) and is out of
 * scope here.
 *
 * Used as an OR with the sender's explicit flag:
 *
 *   const flagged = body.containsAdultContent === true
 *     || scoreAdultContent(body.text).flagged;
 */

/**
 * Patterns are global+case-insensitive so repeated occurrences scale the score
 * linearly. Boundaries are anchored with `(^|[^A-Za-z0-9_])` /
 * `(?![A-Za-z0-9_])` for ASCII; Cyrillic patterns use Unicode-property
 * boundaries (`(?<![\p{L}])` etc, `u` flag) because JS's `\b` is ASCII-only.
 */
const KEYWORD_WEIGHTS: Array<{ pattern: RegExp; weight: number }> = [
  // ASCII-anchored English / transliterations
  { pattern: /(^|[^A-Za-z0-9_])sex(?![A-Za-z0-9_])/gi, weight: 3 },
  { pattern: /(^|[^A-Za-z0-9_])porn(o|ography)?(?![A-Za-z0-9_])/gi, weight: 5 },
  { pattern: /(^|[^A-Za-z0-9_])nude(s|ity)?(?![A-Za-z0-9_])/gi, weight: 5 },
  { pattern: /(^|[^A-Za-z0-9_])naked(?![A-Za-z0-9_])/gi, weight: 3 },
  { pattern: /(^|[^A-Za-z0-9_])nsfw(?![A-Za-z0-9_])/gi, weight: 5 },
  { pattern: /(^|[^A-Za-z0-9_])xxx(?![A-Za-z0-9_])/gi, weight: 4 },
  { pattern: /(^|[^A-Za-z0-9_])onlyfans(?![A-Za-z0-9_])/gi, weight: 5 },
  { pattern: /(^|[^A-Za-z0-9_])dick(?![A-Za-z0-9_])/gi, weight: 3 },
  { pattern: /(^|[^A-Za-z0-9_])pussy(?![A-Za-z0-9_])/gi, weight: 3 },
  { pattern: /(^|[^A-Za-z0-9_])cock(?![A-Za-z0-9_])/gi, weight: 3 },
  { pattern: /(^|[^A-Za-z0-9_])boob(s|ies)?(?![A-Za-z0-9_])/gi, weight: 3 },
  { pattern: /(^|[^A-Za-z0-9_])tit(s|ties)(?![A-Za-z0-9_])/gi, weight: 3 },
  { pattern: /(^|[^A-Za-z0-9_])cum(?![A-Za-z0-9_])/gi, weight: 3 },
  { pattern: /(^|[^A-Za-z0-9_])orgasm(?![A-Za-z0-9_])/gi, weight: 4 },
  { pattern: /(^|[^A-Za-z0-9_])masturbat(e|ion|ing)(?![A-Za-z0-9_])/gi, weight: 4 },
  { pattern: /(^|[^A-Za-z0-9_])horny(?![A-Za-z0-9_])/gi, weight: 3 },
  { pattern: /(^|[^A-Za-z0-9_])sext(?![A-Za-z0-9_])/gi, weight: 4 },
  { pattern: /(send|show).{0,10}(^|[^A-Za-z0-9_])nudes?(?![A-Za-z0-9_])/gi, weight: 5 },
  // Mongolian — Unicode-letter boundary so the patterns work on Cyrillic.
  { pattern: /(?<![\p{L}])бэлгийн\s+харьцаа(?![\p{L}])/giu, weight: 4 },
  { pattern: /(?<![\p{L}])нуруу\s*бие(?![\p{L}])/giu, weight: 3 },
  { pattern: /(?<![\p{L}])нүцгэн(?![\p{L}])/giu, weight: 5 },
  { pattern: /(?<![\p{L}])порно(?![\p{L}])/giu, weight: 5 },
  { pattern: /(?<![\p{L}])секс(?![\p{L}])/giu, weight: 3 },
];

const DEFAULT_FLAG_THRESHOLD = 5;

export type AdultContentScore = {
  /** Sum of (matches × weight) across all patterns. */
  score: number;
  /** True when `score >= threshold`. */
  flagged: boolean;
  /** Pattern source strings that fired at least once, for audit / debug. */
  matches: string[];
};

export function scoreAdultContent(input: string | null | undefined, threshold = DEFAULT_FLAG_THRESHOLD): AdultContentScore {
  if (!input) return { score: 0, flagged: false, matches: [] };
  // Cap so a pathological message doesn't burn CPU on regex scans. Real DMs
  // are << 4000 chars; long pastes are vanishingly rare and acceptable as a
  // false-negative on this signal-only check.
  const text = String(input).slice(0, 4000);
  let score = 0;
  const matches: string[] = [];
  for (const { pattern, weight } of KEYWORD_WEIGHTS) {
    const found = text.match(pattern);
    if (found) {
      score += weight * found.length;
      matches.push(pattern.source);
    }
  }
  return { score, flagged: score >= threshold, matches };
}
