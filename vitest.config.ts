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
      // UI primitives (.tsx) are covered by Playwright over /kitchen-sink
      // and per-module axe + happy-path specs; exclude them from the vitest
      // coverage so the 80% threshold reflects logic (schemas/actions/repos).
      exclude: ["src/lib/db.ts", "**/*.test.ts", "**/*.tsx"],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
