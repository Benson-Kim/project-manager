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
