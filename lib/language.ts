export const LANGUAGE_STORAGE_KEY = "linksy-language-v2";

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English", locale: "en-US", rtl: false },
  { value: "mn", label: "Mongolian", locale: "mn-MN", rtl: false },
  { value: "zh", label: "Chinese", locale: "zh-CN", rtl: false },
  { value: "ja", label: "Japanese", locale: "ja-JP", rtl: false },
  { value: "ko", label: "Korean", locale: "ko-KR", rtl: false },
  { value: "de", label: "German", locale: "de-DE", rtl: false },
  { value: "ru", label: "Russian", locale: "ru-RU", rtl: false },
] as const;

export type AppLanguage = (typeof LANGUAGE_OPTIONS)[number]["value"];

/** All supported UI / `preferredLanguage` codes (for APIs, caption allowlists, etc.). */
export const LANGUAGE_VALUES: readonly AppLanguage[] = LANGUAGE_OPTIONS.map((option) => option.value);

export const RTL_LANGUAGE_SET = new Set<AppLanguage>(
  LANGUAGE_OPTIONS.filter((o) => o.rtl).map((o) => o.value),
);

export function isRtlAppLanguage(language: AppLanguage): boolean {
  return RTL_LANGUAGE_SET.has(language);
}

export const DEFAULT_LANGUAGE: AppLanguage = "en";

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return typeof value === "string" && LANGUAGE_VALUES.includes(value as AppLanguage);
}

/** Normalizes persisted or request input to a supported app language. */
export function parseAppLanguage(value: string | null | undefined): AppLanguage {
  return isAppLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function localeForLanguage(language: AppLanguage) {
  return LANGUAGE_OPTIONS.find((option) => option.value === language)?.locale ?? "en-US";
}

/** Server-readable cookie that mirrors localStorage so SSR can pick the right `lang`. */
export const LANGUAGE_COOKIE_NAME = "linksy-language";

/**
 * Parse a value (cookie / Accept-Language fragment / arbitrary string) into a
 * supported {@link AppLanguage}, returning `null` when unrecognized.
 */
export function readAppLanguageFromCookieValue(value: string | undefined | null): AppLanguage | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return isAppLanguage(trimmed) ? (trimmed as AppLanguage) : null;
}

/**
 * Fallback: pick the first supported language from a comma-separated
 * `Accept-Language` header value (e.g. `mn,en;q=0.9`).
 */
export function readAppLanguageFromAcceptHeader(value: string | undefined | null): AppLanguage | null {
  if (!value) return null;
  for (const part of value.split(",")) {
    const lang = part.split(";")[0]?.trim().toLowerCase();
    if (!lang) continue;
    if (isAppLanguage(lang)) return lang as AppLanguage;
    const base = lang.split("-")[0];
    if (base && isAppLanguage(base)) return base as AppLanguage;
  }
  return null;
}

export const LANGUAGE_BOOTSTRAP_SCRIPT = `
(() => {
  try {
    const root = document.documentElement;
    const languageOptions = [${LANGUAGE_VALUES.map((value) => `"${value}"`).join(", ")}];
    const rtlLanguages = new Set([${[...RTL_LANGUAGE_SET].map((v) => `"${v}"`).join(", ")}]);
    const savedLanguage = localStorage.getItem("${LANGUAGE_STORAGE_KEY}");
    const language = languageOptions.includes(savedLanguage || "") ? savedLanguage : "${DEFAULT_LANGUAGE}";

    root.lang = language;
    root.dataset.language = language;
    root.dir = rtlLanguages.has(language) ? "rtl" : "ltr";

    // Mirror to a 1y cookie so the server-rendered HTML picks the right
    // \`<html lang>\` on the next navigation. Without this the SSR'd response
    // always says \`lang="en"\` even after the user switched languages.
    var maxAge = 60 * 60 * 24 * 365;
    document.cookie = "${LANGUAGE_COOKIE_NAME}=" + language + ";path=/;max-age=" + maxAge + ";samesite=lax";
  } catch {
    document.documentElement.lang = "${DEFAULT_LANGUAGE}";
    document.documentElement.dataset.language = "${DEFAULT_LANGUAGE}";
    document.documentElement.dir = "ltr";
  }
})();
`;
