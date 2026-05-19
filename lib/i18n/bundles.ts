import type { AppLanguage } from "@/lib/language";

/**
 * Copy bundle keys that have real translated content in the i18n catalog.
 * Add a new bundle here once translators provide a full pack
 * (email-translations.ts, push-translations.ts, digest-email.ts).
 */
export type CopyBundle = "en" | "mn";

/**
 * Per-language fallback into the nearest available {@link CopyBundle}.
 * The dispatch is explicit so adding a new bundle is a single-line change
 * here once the translation file is filled in — no scattered conditionals.
 */
const BUNDLE_FALLBACK: Record<AppLanguage, CopyBundle> = {
  en: "en",
  mn: "mn",
  zh: "en",
  ja: "en",
  ko: "en",
  de: "en",
  ru: "en",
};

export function bundleForLocale(lang: AppLanguage): CopyBundle {
  return BUNDLE_FALLBACK[lang] ?? "en";
}
