"use client";

import { useLanguagePreferences } from "@/components/language-provider";
import { detectCaptionLanguage } from "@/lib/caption-language";
import { isAppLanguage, type AppLanguage } from "@/lib/language";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const LANG_BADGE: Record<string, string> = {
  en: "EN",
  mn: "MN",
  zh: "中文",
  ja: "JA",
  ko: "KO",
  de: "DE",
  ru: "RU",
};

const UI_COPY: Record<
  AppLanguage,
  {
    translate: string;
    hide: string;
    retry: string;
    note: string;
    translating: string;
    langBadgeTitle: string;
    regionLabel: string;
    rateLimit: string;
    genericError: string;
  }
> = {
  en: {
    translate: "Translate",
    hide: "Hide",
    retry: "Retry",
    note: "Machine translation — may be inaccurate.",
    translating: "Translating…",
    langBadgeTitle: "Caption language",
    regionLabel: "Translation",
    rateLimit: "Too many requests. Wait a moment and try again.",
    genericError: "Could not translate. Try again.",
  },
  mn: {
    translate: "Орчуулах",
    hide: "Хураах",
    retry: "Дахин",
    note: "Машин орчуулга — алдаатай байж болно.",
    translating: "Орчуулж байна…",
    langBadgeTitle: "Текстийн хэл",
    regionLabel: "Орчуулга",
    rateLimit: "Хэт олон хүсэлт. Түр хүлээгээд дахин оролдоно уу.",
    genericError: "Орчуулж чадсангүй. Дахин оролдоно уу.",
  },
  zh: {
    translate: "翻译",
    hide: "收起",
    retry: "重试",
    note: "机器翻译，仅供参考。",
    translating: "翻译中…",
    langBadgeTitle: "正文语言",
    regionLabel: "译文",
    rateLimit: "请求过于频繁，请稍后再试。",
    genericError: "翻译失败，请重试。",
  },
  ja: {
    translate: "翻訳",
    hide: "閉じる",
    retry: "再試行",
    note: "機械翻訳のため不正確な場合があります。",
    translating: "翻訳中…",
    langBadgeTitle: "キャプションの言語",
    regionLabel: "翻訳結果",
    rateLimit: "リクエストが多すぎます。少し待ってから再試行してください。",
    genericError: "翻訳に失敗しました。再試行してください。",
  },
  ko: {
    translate: "번역",
    hide: "접기",
    retry: "다시 시도",
    note: "기계 번역이므로 부정확할 수 있습니다.",
    translating: "번역 중…",
    langBadgeTitle: "캡션 언어",
    regionLabel: "번역",
    rateLimit: "요청이 너무 많습니다. 잠시 후 다시 시도하세요.",
    genericError: "번역에 실패했습니다. 다시 시도하세요.",
  },
  de: {
    translate: "Übersetzen",
    hide: "Ausblenden",
    retry: "Erneut versuchen",
    note: "Maschinelle Übersetzung — kann ungenau sein.",
    translating: "Wird übersetzt…",
    langBadgeTitle: "Sprache des Textes",
    regionLabel: "Übersetzung",
    rateLimit: "Zu viele Anfragen. Bitte kurz warten und erneut versuchen.",
    genericError: "Übersetzung fehlgeschlagen. Bitte erneut versuchen.",
  },
  ru: {
    translate: "Перевести",
    hide: "Скрыть",
    retry: "Повторить",
    note: "Машинный перевод — может быть неточным.",
    translating: "Перевод…",
    langBadgeTitle: "Язык подписи",
    regionLabel: "Перевод",
    rateLimit: "Слишком много запросов. Подождите немного и попробуйте снова.",
    genericError: "Не удалось перевести. Попробуйте снова.",
  },
};

export function PostCaptionTranslateToolbar({
  text,
  captionLang,
  className = "",
  variant = "feed",
}: {
  text: string;
  captionLang?: string | null;
  className?: string;
  /** `feed`: language chip + translate pill in the same row as category badges. `detail`: post detail thread column. */
  variant?: "feed" | "detail";
}) {
  const { language } = useLanguagePreferences();
  const copy = UI_COPY[language];
  const [translated, setTranslated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const effectiveFrom = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (captionLang && isAppLanguage(captionLang)) return captionLang;
    return detectCaptionLanguage(trimmed) ?? "en";
  }, [captionLang, text]);

  useEffect(() => {
    setTranslated(null);
    setErr(null);
  }, [text, language]);

  const showButton = Boolean(effectiveFrom && effectiveFrom !== language);

  const run = useCallback(async () => {
    if (!effectiveFrom) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setErr(null);
    try {
      const slice = text.slice(0, 1500);
      const res = await fetch("/api/translate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ q: slice, from: effectiveFrom, to: language }),
        signal: ac.signal,
      });
      const data = (await res.json().catch(() => null)) as { translated?: string; error?: string } | null;
      if (!res.ok) {
        const msg =
          res.status === 429
            ? copy.rateLimit
            : (data?.error?.trim() || copy.genericError);
        throw new Error(msg);
      }
      if (!data?.translated?.trim()) {
        throw new Error(copy.genericError);
      }
      setTranslated(data.translated.trim());
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setErr((e as Error).message || copy.genericError);
    } finally {
      setBusy(false);
    }
  }, [effectiveFrom, language, text, copy]);

  const clearTranslation = useCallback(() => {
    setTranslated(null);
    setErr(null);
  }, []);

  if (!text.trim()) return null;

  const isFeed = variant === "feed";
  const rootClass = [
    "post-caption-i18n",
    isFeed ? "post-caption-i18n--badge-flow" : "post-caption-i18n--detail",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <div className="post-caption-i18n__toolbar">
        {!showButton && effectiveFrom ? (
          <span className="post-caption-i18n__chip" title={copy.langBadgeTitle}>
            <span className="post-caption-i18n__chip-mark" aria-hidden>
              🌐
            </span>
            <span>{LANG_BADGE[effectiveFrom] ?? effectiveFrom.toUpperCase()}</span>
          </span>
        ) : null}
        {showButton && !translated ? (
          <button
            type="button"
            className="post-caption-i18n__combo"
            onClick={run}
            disabled={busy}
            aria-busy={busy}
            title={copy.langBadgeTitle}
            aria-label={`${busy ? copy.translating : err ? copy.retry : copy.translate} (${effectiveFrom} → ${language})`}
          >
            <span className="post-caption-i18n__chip-mark" aria-hidden>
              🌐
            </span>
            <span className="post-caption-i18n__combo-code">{LANG_BADGE[effectiveFrom!]}</span>
            <span className="post-caption-i18n__combo-divider" aria-hidden />
            <span className="post-caption-i18n__combo-label">
              {busy ? copy.translating : err ? copy.retry : copy.translate}
            </span>
          </button>
        ) : null}
        {showButton && translated ? (
          <button
            type="button"
            className="post-caption-i18n__combo post-caption-i18n__combo--active"
            onClick={clearTranslation}
            aria-label={copy.hide}
            title={copy.hide}
          >
            <span className="post-caption-i18n__chip-mark" aria-hidden>
              🌐
            </span>
            <span className="post-caption-i18n__combo-code">{LANG_BADGE[effectiveFrom!]}</span>
            <span className="post-caption-i18n__combo-divider" aria-hidden />
            <span className="post-caption-i18n__combo-label">{copy.hide}</span>
          </button>
        ) : null}
      </div>
      {translated ? (
        <section
          className="post-caption-i18n__panel post-caption-i18n__break-row"
          aria-label={copy.regionLabel}
          dir="auto"
        >
          <p className="post-caption-i18n__translated">{translated}</p>
          <p className="post-caption-i18n__note">{copy.note}</p>
        </section>
      ) : null}
      {err && !translated ? (
        <p className="post-caption-i18n__err post-caption-i18n__break-row" role="alert">
          {err}
        </p>
      ) : null}
    </div>
  );
}
