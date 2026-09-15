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
      // UI primitives are covered by Playwright over /kitchen-sink (ADR-0013).
      exclude: ["src/lib/db.ts", "**/*.test.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
