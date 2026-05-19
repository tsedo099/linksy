"use client";

import {
  type AccentColor,
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  DEFAULT_FONT_SCALE,
  DEFAULT_MOTION_PREF,
  DEFAULT_THEME,
  FONT_SCALE_STORAGE_KEY,
  type FontScale,
  isAccentColor,
  isFontScale,
  isMotionPreference,
  isThemeMode,
  MOTION_PREF_STORAGE_KEY,
  type MotionPreference,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from "@/lib/theme";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type ThemeContextValue = {
  accent: AccentColor;
  fontScale: FontScale;
  motionPref: MotionPreference;
  motionResolved: "full" | "reduced";
  ready: boolean;
  setAccent: (accent: AccentColor) => void;
  setFontScale: (fontScale: FontScale) => void;
  setMotionPref: (motionPref: MotionPreference) => void;
  setTheme: (theme: ThemeMode) => void;
  theme: ThemeMode;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveMotion(pref: MotionPreference, systemReduced: boolean): "full" | "reduced" {
  if (pref === "reduced") return "reduced";
  if (pref === "full") return "full";
  return systemReduced ? "reduced" : "full";
}

function applyPreferences(args: {
  theme: ThemeMode;
  accent: AccentColor;
  fontScale: FontScale;
  motionPref: MotionPreference;
  motionResolved: "full" | "reduced";
}) {
  const root = document.documentElement;
  root.dataset.theme = args.theme;
  root.dataset.accent = args.accent;
  root.dataset.fontScale = args.fontScale;
  root.dataset.motionPref = args.motionPref;
  root.dataset.motion = args.motionResolved;
  root.style.colorScheme = args.theme;
  root.classList.add("theme-ready");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(DEFAULT_THEME);
  const [accent, setAccentState] = useState<AccentColor>(DEFAULT_ACCENT);
  const [fontScale, setFontScaleState] = useState<FontScale>(DEFAULT_FONT_SCALE);
  const [motionPref, setMotionPrefState] = useState<MotionPreference>(DEFAULT_MOTION_PREF);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const initialTheme = isThemeMode(root.dataset.theme) ? root.dataset.theme : DEFAULT_THEME;
    const initialAccent = isAccentColor(root.dataset.accent) ? root.dataset.accent : DEFAULT_ACCENT;
    const initialScale = isFontScale(root.dataset.fontScale) ? root.dataset.fontScale : DEFAULT_FONT_SCALE;
    const initialMotion = isMotionPreference(root.dataset.motionPref) ? root.dataset.motionPref : DEFAULT_MOTION_PREF;

    setThemeState(initialTheme);
    setAccentState(initialAccent);
    setFontScaleState(initialScale);
    setMotionPrefState(initialMotion);

    let systemReduced = false;
    let mediaQuery: MediaQueryList | null = null;
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      try {
        mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        systemReduced = mediaQuery.matches;
      } catch {
        mediaQuery = null;
      }
    }
    setSystemReducedMotion(systemReduced);

    applyPreferences({
      theme: initialTheme,
      accent: initialAccent,
      fontScale: initialScale,
      motionPref: initialMotion,
      motionResolved: resolveMotion(initialMotion, systemReduced),
    });

    setReady(true);

    if (!mediaQuery) return;

    const listener = (event: MediaQueryListEvent) => setSystemReducedMotion(event.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery!.removeEventListener("change", listener);
    }
    if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(listener);
      return () => mediaQuery!.removeListener(listener);
    }
    return undefined;
  }, []);

  const motionResolved = useMemo(() => resolveMotion(motionPref, systemReducedMotion), [motionPref, systemReducedMotion]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    applyPreferences({ theme, accent, fontScale, motionPref, motionResolved });

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      localStorage.setItem(ACCENT_STORAGE_KEY, accent);
      localStorage.setItem(FONT_SCALE_STORAGE_KEY, fontScale);
      localStorage.setItem(MOTION_PREF_STORAGE_KEY, motionPref);
    } catch {
      // Ignore storage failures and keep the in-memory selection active.
    }
  }, [accent, fontScale, motionPref, motionResolved, ready, theme]);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
  }, []);

  const setAccent = useCallback((nextAccent: AccentColor) => {
    setAccentState(nextAccent);
  }, []);

  const setFontScale = useCallback((nextFontScale: FontScale) => {
    setFontScaleState(nextFontScale);
  }, []);

  const setMotionPref = useCallback((nextMotionPref: MotionPreference) => {
    setMotionPrefState(nextMotionPref);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      accent,
      fontScale,
      motionPref,
      motionResolved,
      ready,
      setAccent,
      setFontScale,
      setMotionPref,
      setTheme,
      theme,
      toggleTheme,
    }),
    [accent, fontScale, motionPref, motionResolved, ready, setAccent, setFontScale, setMotionPref, setTheme, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreferences() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useThemePreferences must be used within ThemeProvider.");
  }

  return context;
}
