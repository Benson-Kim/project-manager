import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "build/**",
    "dist-installer/**",
    "installers/**",
  ]),
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
  {
    // Stored-procedure-only data access: forbid raw SQL execution APIs.
    // (Backstop unit tests: src/test/no-inline-sql.test.ts, db-gateway.test.ts)
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='query']",
          message:
            "Raw .query() is forbidden — all data access goes through stored procedures (execProc in src/lib/db.ts).",
        },
        {
          selector: "CallExpression[callee.property.name='batch']",
          message:
            "Raw .batch() is forbidden — all data access goes through stored procedures (execProc in src/lib/db.ts).",
        },
      ],
      // STANDARDS §1.4: one ConfirmDialog pattern, no browser prompts.
      "no-alert": "error",
      // STANDARDS §2: src/lib/db.ts is the single database gateway.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "mssql",
              message:
                "Import mssql only in src/lib/db.ts — repositories use execProc (docs/STANDARDS.md §2).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/db.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  {
    // Desktop host (Electron main process) is database *administration*
    // tooling — schema apply (DDL), BACKUP/RESTORE, admin bootstrap — not app
    // data access, so the stored-procedure-only rules do not apply to it.
    files: ["electron/**/*.ts", "scripts/desktop/**"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-syntax": "off",
    },
  },
  {
    // electron-builder loads its config as CommonJS.
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);

export default eslintConfig;
