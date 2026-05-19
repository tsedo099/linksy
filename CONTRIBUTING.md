# Contributing to Linksy

Thanks for your interest in contributing. This document covers the day-to-day
mechanics — for security issues see [SECURITY.md](SECURITY.md), and for
high-level project context see the README.

## Getting set up

Requirements:

- Node.js **22.x** (matches the Docker base image — older majors are untested).
- PostgreSQL 15+ (a local Docker container is fine).
- Redis 7+ (only required for SSE fan-out and rate limiting in multi-process dev).
- Recommended: VS Code with the `dbaeumer.vscode-eslint` and
  `esbenp.prettier-vscode` extensions.

```bash
cp .env.example .env       # fill in DATABASE_URL, secrets, etc.
npm ci
npx prisma migrate dev     # apply schema + seed defaults
npm run dev                # http://localhost:3000
```

## Branch & PR workflow

- Branch off `main`. Name branches `feat/<slug>`, `fix/<slug>`, `chore/<slug>`,
  or `docs/<slug>` — the prefix doesn't affect tooling, it just makes the PR
  list scannable.
- Keep PRs focused. One logical change per PR. If you find an unrelated bug
  while working, file a follow-up instead of bundling.
- Rebase rather than merging `main` into your branch — keeps history linear.
- PR description should explain **why**, not just **what**. A reviewer can read
  the diff for the *what*.

## Commits

- Imperative present-tense subject (`Fix call-signal heartbeat leak`, not
  `Fixed` / `Fixing`).
- Keep subject under ~70 chars. Body wraps at 72.
- Reference issues with `Closes #123` / `Refs #123` in the body — not the subject.
- Don't bypass hooks (`--no-verify`) without a written reason in the PR.

## Code style

- TypeScript strict; no `any` unless justified with a `// eslint-disable-next-line`
  and a comment explaining why.
- React Server Components by default. Add `"use client"` only when you need
  state, effects, or browser APIs.
- Prefer Prisma helpers over raw SQL; if you need raw SQL, parameterise it.
- Tailwind for styling; avoid one-off CSS files.
- Run `npm run format` and `npm run lint` before pushing.

## Tests

We run three layers:

| Layer       | Command           | When to add                                  |
| ----------- | ----------------- | -------------------------------------------- |
| Unit        | `npm test`        | Pure logic in `lib/` — schemas, crypto, etc. |
| Integration | `npm test`        | API routes hitting a real Prisma client.     |
| E2E         | `npm run test:e2e`| User-visible flows in a real browser.        |

A PR should ship with tests for the layer that best validates the change.
Bug fixes should add a regression test that fails on the unpatched code.

Before opening a PR, locally run at minimum:

```bash
npm run typecheck
npm test
```

E2E (`npm run test:e2e`) is slower — run it when you touch routing,
authentication, or anything that crosses the server/client boundary.

## Database changes

- New migrations via `npx prisma migrate dev --name <descriptive_name>`.
- **Never edit a migration after it has been merged** — write a follow-up
  migration instead.
- Backfills that touch large tables (>100k rows) should be batched in
  application code, not done inline in the migration.

## What needs a discussion first

Open an issue *before* a PR for:

- New top-level dependencies.
- Schema changes that drop columns or rename tables.
- New environment variables (production deploy needs them set).
- Changes to authentication, payment, or moderation flows.
- New public API routes.

Small bug fixes, doc tweaks, and contained refactors can go straight to a PR.

## Code of conduct

Be kind. Assume good faith. Disagree with ideas, not people. See
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
