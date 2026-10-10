import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    testTimeout: 15000,
    // electron/ and scripts/desktop/ hold the desktop host and its release helper.
    include: ["src/**/*.test.ts", "electron/**/*.test.ts", "scripts/**/*.test.mjs"],
    environment: "node",
    coverage: {
      provider: "v8",
      // Scope: all logic in lib/ and modules/. Component files (.tsx) are
      // exercised by Playwright e2e; they are excluded from the unit-test
      // threshold so the 80% gate measures business logic coverage only.
      // This matches STANDARDS §10: "coverage ≥ 80% on src/modules/** and
      // src/lib/**" — the intent is logic coverage, not rendering coverage.
      include: ["src/lib/**", "src/modules/**"],
      // UI components (.tsx) are covered by Playwright (kitchen-sink + per-module
      // axe/happy-path specs). They run in a browser env that vitest node cannot
      // reach, so exclude them here; the 80% gate applies to the testable logic
      // layer: schemas, repositories, actions, and utility modules.
      exclude: ["src/lib/db.ts", "**/*.test.ts", "src/**/*.tsx", "src/**/*.d.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
