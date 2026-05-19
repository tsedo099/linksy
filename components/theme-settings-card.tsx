"use client";

import {
  ACCENT_OPTIONS,
  FONT_SCALE_OPTIONS,
  MOTION_PREF_OPTIONS,
  type AccentColor,
  type FontScale,
  type MotionPreference,
  type ThemeMode,
} from "@/lib/theme";
import { useThemePreferences } from "@/components/theme-provider";
import type { CSSProperties } from "react";

const THEME_OPTIONS: Array<{ description: string; label: string; value: ThemeMode }> = [
  {
    value: "dark",
    label: "Dark",
    description: "Rich contrast for focused browsing.",
  },
  {
    value: "light",
    label: "Light",
    description: "Bright surfaces for daytime work.",
  },
];

export function ThemeSettingsCard() {
  const {
    accent,
    fontScale,
    motionPref,
    ready,
    setAccent,
    setFontScale,
    setMotionPref,
    setTheme,
    theme,
  } = useThemePreferences();

  return (
    <section className="widget-card theme-settings-card" aria-labelledby="theme-settings-title">
      <div className="widget-header theme-settings-header">
        <span className="theme-settings-kicker">Appearance</span>
      </div>

      <div className="theme-settings-copy">
        <h3 id="theme-settings-title">Theme & Accent</h3>
        <p>Personalize the interface, text size, and motion.</p>
      </div>

      <div className="theme-mode-group" role="group" aria-label="Theme mode">
        {THEME_OPTIONS.map((option) => {
          const active = theme === option.value;

          return (
            <button
              key={option.value}
              type="button"
              className={`theme-mode-button${active ? " theme-mode-button--active" : ""}`}
              onClick={() => setTheme(option.value)}
              aria-pressed={active}
              disabled={!ready}
            >
              <span className="theme-mode-button-title">{option.label}</span>
              <span className="theme-mode-button-description">{option.description}</span>
            </button>
          );
        })}
      </div>

      <div className="theme-accent-copy">
        <p>Accent</p>
        <span>Use color only for actions and highlights.</span>
      </div>

      <div className="theme-accent-grid" role="group" aria-label="Accent color">
        {ACCENT_OPTIONS.map((option) => {
          const active = accent === option.value;

          return (
            <button
              key={option.value}
              type="button"
              className={`theme-accent-button${active ? " theme-accent-button--active" : ""}`}
              onClick={() => setAccent(option.value as AccentColor)}
              aria-pressed={active}
              disabled={!ready}
            >
              <span
                className="theme-accent-swatch"
                style={{ "--theme-accent-preview": option.hex } as CSSProperties}
                aria-hidden="true"
              />
              <span className="theme-accent-label">{option.label}</span>
            </button>
          );
        })}
      </div>

      <div className="theme-accent-copy">
        <p>Font size</p>
        <span>Larger text helps readability.</span>
      </div>

      <div className="theme-mode-group" role="group" aria-label="Font size">
        {FONT_SCALE_OPTIONS.map((option) => {
          const active = fontScale === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`theme-mode-button${active ? " theme-mode-button--active" : ""}`}
              onClick={() => setFontScale(option.value as FontScale)}
              aria-pressed={active}
              disabled={!ready}
            >
              <span className="theme-mode-button-title">{option.label}</span>
              <span className="theme-mode-button-description">{option.description}</span>
            </button>
          );
        })}
      </div>

      <div className="theme-accent-copy">
        <p>Motion</p>
        <span>Match the OS or reduce animations.</span>
      </div>

      <div className="theme-mode-group" role="group" aria-label="Motion preference">
        {MOTION_PREF_OPTIONS.map((option) => {
          const active = motionPref === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`theme-mode-button${active ? " theme-mode-button--active" : ""}`}
              onClick={() => setMotionPref(option.value as MotionPreference)}
              aria-pressed={active}
              disabled={!ready}
            >
              <span className="theme-mode-button-title">{option.label}</span>
              <span className="theme-mode-button-description">{option.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
