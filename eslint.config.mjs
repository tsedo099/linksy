import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
/** @type {import("eslint").Linter.Config[]} */
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: [
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "node_modules/**",
      ".next/**",
      "prisma/migrations/**",
      "lib/generated/**",
      // k6 load-test scripts run under the k6 runtime, not Node — their
      // `require()` + module conventions trip the Next.js eslint preset
      // (no `@typescript-eslint/no-require-imports` rule registered for JS
      // files). Not shipped with the app, no value in linting.
      "scripts/k6-*.js",
    ],
  },
  {
    rules: {
      // React Compiler–style hooks rules: enable gradually; current app patterns fail clean lint.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
];

export default eslintConfig;
