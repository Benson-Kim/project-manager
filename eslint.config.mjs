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
    // (Backstop unit test: src/test/no-inline-sql.test.ts)
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
    },
  },
]);

export default eslintConfig;
