import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/generated/**", "**/*.test.ts", "**/*.spec.ts", "**/vitest.setup.ts"],
      thresholds: {
        lines: 4.5,
        statements: 4.5,
        branches: 3,
        functions: 3,
        "lib/password-policy.ts": {
          lines: 90,
          branches: 85,
          statements: 90,
          functions: 90,
        },
        "lib/notification-rules.ts": {
          lines: 85,
          branches: 80,
          statements: 85,
          functions: 85,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
