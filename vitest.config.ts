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
      // Components (.tsx) are covered by Playwright — exclude from unit-test thresholds.
      exclude: ["src/lib/db.ts", "**/*.test.ts", "**/*.tsx"],
      thresholds: {
        lines: 80,
        functions: 80,
      },
    },
  },
});
