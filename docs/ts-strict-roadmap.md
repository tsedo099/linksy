# TypeScript Strict Mode — Adoption Roadmap

[tsconfig.json](../tsconfig.json) is already on `"strict": true`. This document
tracks the remaining strict-family flags and the migration plan for each.

## Currently enabled

| Flag                       | Status | Notes                                                          |
| -------------------------- | ------ | -------------------------------------------------------------- |
| `strict`                   | ✅     | Bundle: `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `alwaysStrict`, `useUnknownInCatchVariables`. |
| `noImplicitOverride`       | ✅     | Class methods that override a base implementation must say `override`. Currently a no-op (no class hierarchies of consequence), but on so any new class can't accidentally shadow. |
| `noUncheckedIndexedAccess` | ✅     | Array index / `Record<>` access returns `T \| undefined`. **All 126 errors fixed in one pass (~46 files across lib/, app/api/, components/, prisma/, scripts/).** Pattern adopted: `?? fallback` for inline defaults, `if (!x) continue/return` for invariant-guarded paths, never `!` non-null assertions. |

## Pending — invasive flags

Each pending flag, when toggled to `true`, surfaces a known count of errors
in the current codebase. Re-survey before opening the migration PR.

| Flag                          | Errors | Migration shape                              |
| ----------------------------- | -----: | -------------------------------------------- |
| `exactOptionalPropertyTypes`  | **152** (surveyed 2026-05-17) | Splitting `T \| undefined` vs `T?` at the type level. Bulk of errors are component-prop wiring: `Page onBack={onBack}` where `onBack: (() => void) \| undefined` passed to `onBack?: () => void`. Top clusters: `components/settings-screen.tsx` (52), `components/landing/shared.tsx` (14), `components/messages-screen.tsx` (6). Migration order: (a) fix prop type definitions in primitives — `Page`, `Row`, `Card`, `MomentCardData` — to accept `\| undefined` explicitly, (b) audit API boundary types separately for genuine "absent vs undefined" semantics. |

## Migration order

1. **`exactOptionalPropertyTypes` (next).** Survey first — many false positives
   cleared up when `noUncheckedIndexedAccess` landed. Sticker / story draft
   types (`color?`, `mentionUserId?`) are the dominant remaining cluster;
   fix by normalizing on `color: string | null` everywhere rather than
   `color?: string`.

## Why not in one giant PR

- Type errors are intermixed with behavioral assumptions. Fixing 126 of them
  in one shot loses the audit trail that lets us blame a regression on a
  specific fix.
- CI must keep passing across the migration — splitting work means each PR
  delivers a working green baseline.
- Code review attention drops sharply past ~30 fixes per PR.

## "How do I fix this error?" cheat-sheet

| Pattern                                  | Fix                                              |
| ---------------------------------------- | ------------------------------------------------ |
| `Object is possibly 'undefined'` on `arr[i]` | Guard with `const x = arr[i]; if (!x) return;` or destructure with default. |
| `string \| undefined` passed to `string` arg | Add `?? ""` when empty is fine, otherwise guard the caller. |
| `'only' is possibly 'undefined'` after `find` | `const only = arr.find(...); if (!only) return;` — never re-use `arr[0]!` unless the search guaranteed presence. |
| `params: Promise<{ id: string }>` destructuring | Always `const { id } = await params;` first; never `(await params).id` in JSX. |

Owner: platform team. Re-survey error counts quarterly.
