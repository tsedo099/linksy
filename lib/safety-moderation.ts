export type SafetySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ModerationFindingKind =
  | "toxicity"
  | "harassment"
  | "threat"
  | "spam"
  | "caps"
  | "repetition"
  | "healthy-friction";

export type ModerationAction = "allow" | "warn" | "quarantine" | "block";

export type ModerationFinding = {
  kind: ModerationFindingKind;
  severity: SafetySeverity;
  score: number;
  message: string;
  matchedTerms?: string[];
};

export type ModerationResult = {
  allowed: boolean;
  action: ModerationAction;
  severity: SafetySeverity;
  score: number;
  userMessage: string | null;
  findings: ModerationFinding[];
};

/**
 * Latin toxic phrases. Cyrillic equivalents are added via {@link CYRILLIC_TOXIC_PHRASES}
 * so they survive transliteration of мон. input ("тэнэг" -> "teneg").
 */
const TOXIC_PHRASES = [
  "you are stupid",
  "you're stupid",
  "stupid",
  "idiot",
  "moron",
  "dumb",
  "trash",
  "shut up",
  "nobody likes you",
  "teneg",
  "erguu",
  "muu amitan",
  "muusain",
  "tenheg",
  "tom",
  "loser",
  "scum",
];

/** Native Cyrillic phrases. The normalizer also derives latin equivalents on the fly. */
const CYRILLIC_TOXIC_PHRASES = [
  "тэнэг",
  "эргүү",
  "муу амьтан",
  "муусайн",
  "тэнхэг",
  "новш",
];

const THREAT_PHRASES = [
  "kill yourself",
  "kys",
  "i will hurt you",
  "i will find you",
  "i will kill you",
  "alna",
  "ulna",
  "i hope you die",
];

const CYRILLIC_THREAT_PHRASES = [
  "өөрийгөө ал",
  "алъя",
  "алах болно",
  "үхээч",
];

const SPAM_URL_RE = /(https?:\/\/|www\.)/gi;

/** Substitution table for common leetspeak — keeps moderation tight against trivial obfuscation. */
const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s",
  "!": "i",
  "|": "i",
};

/**
 * Strip combining diacritics and lowercase. Lossless for letter-set matching: we only
 * use this on the *latin alias* of input, not the original text shown to anyone.
 */
function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Replace common leetspeak digits/symbols with letters. */
function deleet(input: string): string {
  let out = "";
  for (const ch of input) {
    out += LEET_MAP[ch] ?? ch;
  }
  return out;
}

/**
 * Collapse runs of repeated letters: "stuuupiiid" -> "stupid", "stuupid" -> "stupid".
 * Only used on the latin alias (matching only), never on text shown to anyone.
 */
function collapseRepeats(input: string): string {
  return input.replace(/([a-z])\1+/g, "$1");
}

/** Map Cyrillic characters to a coarse latin alias so transliterated words still match. */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
  "ж": "j", "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m",
  "н": "n", "о": "o", "ө": "o", "п": "p", "р": "r", "с": "s", "т": "t",
  "у": "u", "ү": "u", "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh",
  "щ": "sh", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
};

function transliterateCyrillic(input: string): string {
  let out = "";
  for (const ch of input) {
    out += CYRILLIC_TO_LATIN[ch] ?? ch;
  }
  return out;
}

/** Lowercase + whitespace-collapsed; preserves original characters for native-language matching. */
function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * The "latin alias" — used for matching against the latin phrase lists. Combines:
 * lowercase, Cyrillic transliteration, leetspeak unmasking, diacritic stripping,
 * non-alphanum collapse, repeated-letter collapse.
 */
export function latinAlias(input: string): string {
  const lower = input.toLowerCase();
  const transliterated = transliterateCyrillic(lower);
  const deletted = deleet(transliterated);
  const noAccents = stripDiacritics(deletted);
  const collapsed = collapseRepeats(noAccents.replace(/[^a-z\s]/g, " "));
  return collapsed.replace(/\s+/g, " ").trim();
}

function severityFromScore(score: number): SafetySeverity {
  if (score >= 0.9) return "CRITICAL";
  if (score >= 0.7) return "HIGH";
  if (score >= 0.45) return "MEDIUM";
  return "LOW";
}

function repeatedTokenScore(text: string) {
  const tokens = normalize(text).split(" ").filter(Boolean);
  if (tokens.length < 8) return 0;
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  const max = Math.max(...counts.values());
  return max / tokens.length;
}

function capsScore(text: string) {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 10) return 0;
  const caps = letters.replace(/[^A-Z]/g, "").length;
  return caps / letters.length;
}

/** Escape regex metacharacters in a phrase. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns the phrases that appear in either the original normalized text or its latin alias.
 * Single-word phrases match with word boundaries (so `stupid` does NOT match inside `stupendous`).
 * The latin alias is collapsed (`erguu` -> `ergu`), so phrases are normalized the same way before
 * matching against the alias haystack.
 */
function phraseMatches(text: string, phrases: string[]): string[] {
  const normalized = normalize(text);
  const alias = latinAlias(text);
  const matches: string[] = [];

  for (const phrase of phrases) {
    if (matches.includes(phrase)) continue;
    const isSingleWord = !phrase.includes(" ");
    const phraseLower = phrase.toLowerCase();
    const phraseAlias = latinAlias(phrase);

    const buildPattern = (needle: string) =>
      isSingleWord
        ? new RegExp(`(?:^|[^a-zа-яёөү])${escapeRegex(needle)}(?:[^a-zа-яёөү]|$)`, "iu")
        : new RegExp(escapeRegex(needle), "i");

    if (buildPattern(phraseLower).test(normalized)) matches.push(phrase);
    else if (phraseAlias && buildPattern(phraseAlias).test(alias)) matches.push(phrase);
  }
  return matches;
}

function maxSeverity(a: SafetySeverity, b: SafetySeverity): SafetySeverity {
  const order: SafetySeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

const STRONG_TOXIC_TERMS = new Set(["stupid", "idiot", "moron", "teneg", "erguu", "scum", "muusain", "тэнэг", "эргүү", "муусайн", "новш"]);

export function scanText(input: string): ModerationResult {
  const text = input.trim();
  const findings: ModerationFinding[] = [];
  let score = 0;
  let severity: SafetySeverity = "LOW";

  const threats = phraseMatches(text, [...THREAT_PHRASES, ...CYRILLIC_THREAT_PHRASES]);
  if (threats.length > 0) {
    findings.push({
      kind: "threat",
      severity: "CRITICAL",
      score: 0.95,
      message: "Threatening or self-harm language detected.",
      matchedTerms: threats,
    });
    score = Math.max(score, 0.95);
    severity = "CRITICAL";
  }

  const toxic = phraseMatches(text, [...TOXIC_PHRASES, ...CYRILLIC_TOXIC_PHRASES]);
  if (toxic.length > 0) {
    const phraseScore = toxic.some((term) => STRONG_TOXIC_TERMS.has(term)) ? 0.72 : 0.58;
    const phraseSeverity = severityFromScore(phraseScore);
    findings.push({
      kind: "toxicity",
      severity: phraseSeverity,
      score: phraseScore,
      message: "Potentially toxic personal attack detected.",
      matchedTerms: toxic,
    });
    score = Math.max(score, phraseScore);
    severity = maxSeverity(severity, phraseSeverity);
  }

  const urlCount = (text.match(SPAM_URL_RE) ?? []).length;
  if (urlCount >= 3) {
    findings.push({
      kind: "spam",
      severity: "HIGH",
      score: 0.82,
      message: "Multiple links look like spam.",
    });
    score = Math.max(score, 0.82);
    severity = maxSeverity(severity, "HIGH");
  }

  const repetition = repeatedTokenScore(text);
  if (repetition >= 0.35) {
    const repetitionScore = Math.min(0.7, repetition + 0.25);
    findings.push({
      kind: "repetition",
      severity: "MEDIUM",
      score: repetitionScore,
      message: "Repeated wording may be spammy.",
    });
    score = Math.max(score, repetitionScore);
    severity = maxSeverity(severity, "MEDIUM");
  }

  const caps = capsScore(text);
  if (caps >= 0.78) {
    findings.push({
      kind: "caps",
      severity: "LOW",
      score: 0.38,
      message: "All-caps messages can feel aggressive.",
    });
    score = Math.max(score, 0.38);
  }

  if (score === 0 && text.length > 0) {
    findings.push({
      kind: "healthy-friction",
      severity: "LOW",
      score: 0.03,
      message: "No policy issue detected.",
    });
  }

  const finalSeverity = severityFromScore(score);
  const action = score >= 0.9 ? "block" : score >= 0.7 ? "quarantine" : score >= 0.35 ? "warn" : "allow";

  return {
    allowed: action !== "block",
    action,
    severity: score > 0 ? maxSeverity(severity, finalSeverity) : "LOW",
    score: Number(score.toFixed(2)),
    userMessage:
      action === "block"
        ? "This message violates community guidelines and cannot be posted."
        : action === "quarantine"
          ? "This comment may violate community guidelines. It will be held for review."
          : action === "warn"
            ? "This comment may violate community guidelines."
            : null,
    findings,
  };
}
