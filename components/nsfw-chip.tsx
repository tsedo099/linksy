/**
 * Visual marker rendered on adult-flagged posts/stories in the 18+ feed.
 * Server-side filtering already strips flagged rows for under-18 viewers, so
 * by the time this chip renders the viewer is allowed to see it — the chip
 * is purely a content-moderation visibility cue ("this is marked NSFW") so
 * the user can scroll past quickly if they want.
 *
 * Kept dependency-free (no lucide icon) so it can ship inside Server
 * Components if a feed item is ever moved to RSC.
 */

export function NsfwChip({
  size = "sm",
  className = "",
}: {
  size?: "sm" | "md";
  className?: string;
}) {
  const padding = size === "md" ? "4px 10px" : "2px 8px";
  const fontSize = size === "md" ? 12 : 11;
  return (
    <span
      role="img"
      aria-label="Marked as adult content"
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding,
        borderRadius: 999,
        background: "rgba(244,63,94,0.18)",
        color: "#fda4af",
        border: "1px solid rgba(244,63,94,0.35)",
        fontSize,
        fontWeight: 600,
        letterSpacing: 0.2,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden>🔞</span>
      <span>NSFW</span>
    </span>
  );
}
