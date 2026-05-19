/**
 * Conventional Commits convention (https://www.conventionalcommits.org/).
 *
 * Format:   type(scope?): subject
 * Examples:
 *   feat(auth): add passkey login
 *   fix(messages): unread badge stuck on zero after SSE drop
 *   chore(deps): bump next to 16.2.6
 *
 * Type list mirrors the existing CHANGELOG.md conventions. `scope` is optional
 * but encouraged — keep it short and lowercase (auth, messages, profile, ...).
 */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Subject length — soft limit. Body is unlimited.
    "header-max-length": [2, "always", 100],
    // Allow lowercase / sentence case in the subject (default forces lowercase).
    "subject-case": [0],
    // Type whitelist — extend `feat|fix|chore|...` with `i18n` and `a11y`.
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "i18n",
        "a11y",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],
  },
};
