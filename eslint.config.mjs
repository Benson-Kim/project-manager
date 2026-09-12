import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
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
];

export default eslintConfig;
