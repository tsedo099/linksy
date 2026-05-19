"use client";

import { useViewerIsAdult } from "@/lib/use-viewer-adult";

/**
 * Composer toggle for marking a post / story / message as containing adult
 * content. Renders `null` for under-18 viewers so the option doesn't appear
 * in their UI at all — paired with the server-side block in
 * `lib/age-gate.ts`, this prevents flagged content from being authored by
 * minors via the public composer surfaces.
 *
 * Visual style matches the existing "ghost-link" / pill toggle pattern so
 * the toggle blends with the rest of the composer chrome.
 */
export function AdultContentToggle({
  checked,
  onChange,
  label = "Contains adult content",
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  /** Optional helper text beneath the toggle. */
  hint?: string;
}) {
  const adult = useViewerIsAdult();
  if (!adult) return null;

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid rgba(244, 63, 94, 0.35)",
        background: checked ? "rgba(244, 63, 94, 0.18)" : "transparent",
        cursor: "pointer",
        userSelect: "none",
        fontSize: 13,
        fontWeight: 600,
        color: checked ? "#fda4af" : "var(--app-text-muted)",
        transition: "background 0.12s ease",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "#f43f5e", margin: 0 }}
      />
      <span aria-hidden>🔞</span>
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
        <span>{label}</span>
        {hint ? <small style={{ fontWeight: 400, opacity: 0.75 }}>{hint}</small> : null}
      </span>
    </label>
  );
}
