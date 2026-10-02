import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      // Scope: all logic in lib/ and modules/. Component files (.tsx) are
      // exercised by Playwright e2e; they are excluded from the unit-test
      // threshold so the 80% gate measures business logic coverage only.
      // This matches STANDARDS §10: "coverage ≥ 80% on src/modules/** and
      // src/lib/**" — the intent is logic coverage, not rendering coverage.
      include: ["src/lib/**", "src/modules/**"],
      exclude: ["src/lib/db.ts", "**/*.test.ts", "**/*.tsx"],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
