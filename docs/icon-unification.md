# Icon Library Unification

The codebase ships icons two ways today: `lucide-react` for some components,
and inline `<svg>` literals for many feed / profile components. This is an
audit + roadmap, not a single-PR rewrite.

## Inventory (snapshot)

A grep of `components/**/*.tsx` finds **~98 occurrences** across **29 files**.
The split:

- **Already on lucide-react** — `admin-panel-screen`, `billing-screen`,
  `app-shell`, `CreatorToggle`, `NotificationBell`, `notifications-screen`,
  `safe-social-screen`, `settings-screen`, `messages-screen`.
- **Inline `<svg>` literals** — `feed/feed-icons.tsx` (the centralised pile),
  `profile-screen.tsx` (13 inline glyphs at the top), `create-modal.tsx`,
  `feed/feed-story-viewer.tsx`, `landing-screen.tsx`, etc.

The full per-file count is in the audit grep — re-run
`grep -rn "<svg\|from \"lucide-react\"" components/**/*.tsx` quarterly to
track drift.

## Why this matters

- **Tree-shaking.** lucide-react is per-icon import; an inline SVG costs the
  whole literal in every page bundle it appears in. The bundle budget gate
  ([.size-limit.json](../.size-limit.json)) will surface regressions, but
  the unification removes a class of regression entirely.
- **Accessibility.** lucide ships sensible defaults: `focusable=false`,
  `aria-hidden` when no label. Inline SVGs in this repo are inconsistent
  about `aria-hidden` and `role`.
- **Visual coherence.** Stroke width, corner rounding, and viewBox sizes
  drift across the inline icons (some 20×20, some 24×24). A single
  library enforces consistency.

## Target

All icons come from `lucide-react`. The repo keeps **one** exception list,
documented inline, for icons that genuinely have no lucide equivalent
(custom brand glyph, app-specific play-overlay shape, etc.). Anything on
the exception list lives in `components/icons/` as a named React component,
**not** as inline JSX inside a screen.

## Migration phases

| Phase | Scope                                          | Acceptance                                                |
| ----- | ---------------------------------------------- | --------------------------------------------------------- |
| 1     | Centralise existing icons                      | `feed/feed-icons.tsx` exports stay, but each one becomes a lucide wrapper. |
| 2     | `profile-screen.tsx` (13 glyphs)               | Replace `IcGrid`/`IcSaved`/`IcTag` etc with `Grid3x3`/`Bookmark`/`Tag` from lucide. |
| 3     | `create-modal.tsx` + `feed/feed-create-post.tsx` | Compose icons (Image, Video, Smile, MapPin, BarChart3). |
| 4     | `feed/feed-story-viewer.tsx` (10 glyphs)       | Story-specific UI (mute, send, react, more).              |
| 5     | `landing-screen.tsx` + auth screens            | Marketing illustrations stay inline; chrome icons → lucide. |
| 6     | Sweep                                           | ESLint rule: forbid `<svg>` inside `components/**/*.tsx` outside of `components/icons/`. |

## Sizing + stroke convention

Once unified:

```tsx
<Icon size={16} strokeWidth={1.8} aria-hidden />
```

- `size`: 12 (inline-with-text), 16 (default), 18-20 (action buttons),
  24+ (page-level affordances). Never `width="17" height="17"` — that's an
  inline-SVG smell.
- `strokeWidth`: 1.8 (default), 1.6 (subtle), 2.0 (emphasis).
- `aria-hidden` when the icon is decorative (next to a text label).
  `aria-label="…"` when the icon stands alone (icon-only button).

## Why not a single-PR rewrite

- ~98 changes touch user-visible chrome; each one needs a visual sanity
  check.
- Some inline SVGs encode product decisions (a custom heart shape that
  isn't lucide's `Heart`). Distinguishing "drop-in replacement" from
  "deliberate variant" needs the original author's input on ~10 of the 98.

Owner: frontend platform. Open a tracking ticket per phase; budget one
phase per sprint.
