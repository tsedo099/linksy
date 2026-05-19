"use client";

import {
  DEFAULT_LANGUAGE,
  isAppLanguage,
  isRtlAppLanguage,
  LANGUAGE_STORAGE_KEY,
  localeForLanguage,
  type AppLanguage,
} from "@/lib/language";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type LanguageContextValue = {
  language: AppLanguage;
  locale: string;
  ready: boolean;
  setLanguage: (language: AppLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function applyLanguage(language: AppLanguage) {
  const root = document.documentElement;
  root.lang = language;
  root.dataset.language = language;
  root.dir = isRtlAppLanguage(language) ? "rtl" : "ltr";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(DEFAULT_LANGUAGE);
  const [ready, setReady] = useState(false);
  /** Incremented on every `setLanguage` call so a slow `/api/auth/me` response cannot overwrite a fresh user choice. */
  const languageTouchGenerationRef = useRef(0);

  useEffect(() => {
    const root = document.documentElement;
    const initialLanguage = isAppLanguage(root.dataset.language)
      ? root.dataset.language
      : isAppLanguage(root.lang)
        ? root.lang
        : DEFAULT_LANGUAGE;

    setLanguageState(initialLanguage);
    applyLanguage(initialLanguage);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    const touchAtFetchStart = languageTouchGenerationRef.current;
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        if (languageTouchGenerationRef.current !== touchAtFetchStart) return;
        if (!payload?.user) return;
        const pref = payload.user.preferredLanguage;
        if (isAppLanguage(pref)) {
          setLanguageState(pref);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    applyLanguage(language);

    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore storage failures and keep the in-memory selection active.
    }
  }, [language, ready]);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    languageTouchGenerationRef.current += 1;
    setLanguageState(nextLanguage);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      locale: localeForLanguage(language),
      ready,
      setLanguage,
    }),
    [language, ready, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguagePreferences() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error("useLanguagePreferences must be used within LanguageProvider.");
  }

  return context;
}
