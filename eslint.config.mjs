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
  ]),
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
  {
    // Stored-procedure-only data access: forbid raw SQL execution APIs.
    // (Backstop unit tests: src/tests/no-inline-sql.test.ts, db-gateway.test.ts)
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
]);

export default eslintConfig;
