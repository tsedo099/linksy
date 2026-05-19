# Git Hooks (Husky)

This directory contains the project's git pre-commit and commit-msg hooks.
They run automatically once you have:

1. Initialised git in the project:
   ```sh
   git init
   ```

2. Installed dependencies (the `prepare` script in `package.json` runs
   `husky` post-install, which wires `.husky/*` into `.git/hooks/`):
   ```sh
   npm install
   ```

## What runs on commit

### `pre-commit`

1. **lint-staged** — runs `prettier --write` on staged files and
   `eslint --fix --max-warnings=0` on staged `*.ts`/`*.tsx`. Only touched
   files are processed.
2. **typecheck** — if any TypeScript file is staged, runs the full
   `tsc --noEmit`. `tsc` cannot type-check individual files in a project
   context, so this is the only safe gate against shipping a type error.

### `commit-msg`

Runs `commitlint` against [Conventional Commits](https://www.conventionalcommits.org/)
format. Config lives in [commitlint.config.cjs](../commitlint.config.cjs).

Examples:
- ✅ `feat(auth): add passkey login`
- ✅ `fix(messages): unread badge stuck on zero after SSE drop`
- ✅ `i18n(story-editor): add Mongolian copy`
- ❌ `update stuff` — rejected (missing type)
- ❌ `feat add foo` — rejected (missing colon)

## Bypassing (emergencies only)

```sh
git commit --no-verify -m "fix: emergency hotfix"
```

If you bypass, open a follow-up PR to address the skipped checks. The CI
will still gate the merge on lint + typecheck.

## Why not use `.husky/_/husky.sh`?

Husky v9 dropped that shim. Hooks are now plain shell scripts. The
shebang (`#!/usr/bin/env sh`) is the only required line — husky's
install step makes them executable.
