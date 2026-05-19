export const THEME_STORAGE_KEY = "linksy-theme";
export const ACCENT_STORAGE_KEY = "linksy-accent";
export const FONT_SCALE_STORAGE_KEY = "linksy-font-scale";
export const MOTION_PREF_STORAGE_KEY = "linksy-motion-pref";

export const THEME_MODES = ["dark", "light"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const ACCENT_OPTIONS = [
  { value: "indigo", label: "Indigo", hex: "#6366F1" },
  { value: "purple", label: "Purple", hex: "#C084FC" },
  { value: "blue", label: "Blue", hex: "#3B82F6" },
  { value: "green", label: "Green", hex: "#22C55E" },
  { value: "orange", label: "Orange", hex: "#F97316" },
  { value: "yellow", label: "Yellow", hex: "#CA8A04" },
  { value: "white", label: "White", hex: "#FFFFFF" },
  { value: "black", label: "Black", hex: "#0F172A" },
] as const;
export type AccentColor = (typeof ACCENT_OPTIONS)[number]["value"];

const ACCENT_VALUES = ACCENT_OPTIONS.map((option) => option.value);

export const FONT_SCALE_OPTIONS = [
  { value: "small", label: "Small", description: "Fit more content on screen.", percent: 90 },
  { value: "medium", label: "Medium", description: "Balanced default size.", percent: 100 },
  { value: "large", label: "Large", description: "Improved readability.", percent: 115 },
] as const;
export type FontScale = (typeof FONT_SCALE_OPTIONS)[number]["value"];

const FONT_SCALE_VALUES = FONT_SCALE_OPTIONS.map((option) => option.value);

export const MOTION_PREF_OPTIONS = [
  { value: "system", label: "System", description: "Follow your OS reduced-motion setting." },
  { value: "full", label: "Full motion", description: "Show all animations and transitions." },
  { value: "reduced", label: "Reduce motion", description: "Avoid non-essential animations." },
] as const;
export type MotionPreference = (typeof MOTION_PREF_OPTIONS)[number]["value"];

const MOTION_PREF_VALUES = MOTION_PREF_OPTIONS.map((option) => option.value);

export const DEFAULT_THEME: ThemeMode = "dark";
export const DEFAULT_ACCENT: AccentColor = "purple";
export const DEFAULT_FONT_SCALE: FontScale = "medium";
export const DEFAULT_MOTION_PREF: MotionPreference = "system";

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === "dark" || value === "light";
}

export function isAccentColor(value: string | null | undefined): value is AccentColor {
  return typeof value === "string" && ACCENT_VALUES.includes(value as AccentColor);
}

export function isFontScale(value: string | null | undefined): value is FontScale {
  return typeof value === "string" && FONT_SCALE_VALUES.includes(value as FontScale);
}

export function isMotionPreference(value: string | null | undefined): value is MotionPreference {
  return typeof value === "string" && MOTION_PREF_VALUES.includes(value as MotionPreference);
}

export const THEME_BOOTSTRAP_SCRIPT = `
(() => {
  try {
    const root = document.documentElement;
    const accentOptions = [${ACCENT_VALUES.map((value) => `"${value}"`).join(", ")}];
    const fontScaleOptions = [${FONT_SCALE_VALUES.map((value) => `"${value}"`).join(", ")}];
    const motionOptions = [${MOTION_PREF_VALUES.map((value) => `"${value}"`).join(", ")}];

    const savedTheme = localStorage.getItem("${THEME_STORAGE_KEY}");
    const savedAccent = localStorage.getItem("${ACCENT_STORAGE_KEY}");
    const savedScale = localStorage.getItem("${FONT_SCALE_STORAGE_KEY}");
    const savedMotion = localStorage.getItem("${MOTION_PREF_STORAGE_KEY}");

    const theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "${DEFAULT_THEME}";
    const accent = accentOptions.includes(savedAccent || "") ? savedAccent : "${DEFAULT_ACCENT}";
    const fontScale = fontScaleOptions.includes(savedScale || "") ? savedScale : "${DEFAULT_FONT_SCALE}";
    const motionPref = motionOptions.includes(savedMotion || "") ? savedMotion : "${DEFAULT_MOTION_PREF}";

    let motionResolved = motionPref;
    if (motionPref === "system" && typeof window.matchMedia === "function") {
      try {
        motionResolved = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full";
      } catch (_) {
        motionResolved = "full";
      }
    } else if (motionPref === "system") {
      motionResolved = "full";
    }

    root.dataset.theme = theme;
    root.dataset.accent = accent;
    root.dataset.fontScale = fontScale;
    root.dataset.motionPref = motionPref;
    root.dataset.motion = motionResolved;
    root.style.colorScheme = theme;
    root.classList.add("theme-ready");
  } catch {
    document.documentElement.dataset.theme = "${DEFAULT_THEME}";
    document.documentElement.dataset.accent = "${DEFAULT_ACCENT}";
    document.documentElement.dataset.fontScale = "${DEFAULT_FONT_SCALE}";
    document.documentElement.dataset.motionPref = "${DEFAULT_MOTION_PREF}";
    document.documentElement.dataset.motion = "full";
    document.documentElement.style.colorScheme = "${DEFAULT_THEME}";
    document.documentElement.classList.add("theme-ready");
  }
})();
`;
