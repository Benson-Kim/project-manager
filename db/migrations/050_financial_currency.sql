-- 050_financial_currency.sql — a financial sheet carries the currency its figures are shown in
-- (client feedback, `Project Manager Updates.pdf` p.33 carry-forward list and p.12; ADR-0051).
--   "Choose a financial currency or show no currency symbol."
--
--   app.Financial.CurrencyCode NVARCHAR(3) NOT NULL DEFAULT N'': the empty string is "show no
--     currency symbol", which is the second half of the request and the default. Every row that
--     exists today takes N'' and so keeps rendering bare numbers exactly as it does now — this
--     migration changes no figure anybody is already looking at.
--   Scope is the sheet, not the project and not the app, which is how EscalationRate,
--     FiscalYearStartMonth and BudgetIncludesTax already behave under ADR-0029's snapshot model:
--     a financial copied from a master template takes the template's currency at copy time and
--     later template edits never reach it.
--   NOT NULL with a default rather than NULL, so "no symbol" has exactly one representation in
--     stored data. NULL and N'' both meaning "none" is the ambiguity migration 047 avoided for
--     app.TodoItem.Assignee by folding empty text to NULL; here the column is non-nullable and
--     the empty string is the meaningful value, which is the same decision from the other end.
--
--   CK_Financial_CurrencyCode checks the *shape* and never a list of currencies. The list this
--     column draws from is the runtime's ICU data (src/lib/currency/currencies.ts), which gains
--     currencies when the platform updates and differs between Node's build and a browser's. A
--     constraint naming today's currencies would turn a perfectly good stored code into a
--     constraint error on another machine, or need a migration every time a country redenominates.
--     Unknown codes still render — they display as the code itself.
--   COLLATE Latin1_General_BIN is load-bearing, not decoration. The database collation is
--     case-insensitive, and under a case-insensitive collation LIKE N'[A-Z][A-Z][A-Z]' matches
--     N'usd' as happily as N'USD' — the constraint would then be *looser* than the zod and
--     TypeScript shape check (/^[A-Z]{3}$/) it exists to back up, and mixed-case codes would
--     reach storage and fail to resolve a symbol. Forcing a binary collation makes the character
--     ranges mean what they say. Migration 022 pins Sha256's hex check the same way, for the same
--     reason. The procs also UPPER() the value, so this constraint is the second gate, not the
--     first.
--   The constraint is table-level: a column-level CHECK that is fine today is one edit away from
--     naming a second column and dying with error 8141 on apply (see 036 and
--     src/tests/migration-check-constraints.test.ts).
--
--   No index. CurrencyCode is read with the row it belongs to and is never searched or sorted on.
--   app.FinancialTemplate needs no column: its Definition is JSON, so the template default rides
--     in the document and is validated by usp_FinancialTemplate_AssertDefinition and by zod.
-- Idempotent: safe to re-run.
USE ProjectManager;
GO

IF COL_LENGTH(N'app.Financial', N'CurrencyCode') IS NULL
    ALTER TABLE app.Financial ADD [CurrencyCode] NVARCHAR(3) NOT NULL
        CONSTRAINT DF_Financial_CurrencyCode DEFAULT N'';
GO

IF OBJECT_ID(N'app.CK_Financial_CurrencyCode', N'C') IS NULL
    ALTER TABLE app.Financial ADD CONSTRAINT CK_Financial_CurrencyCode
        CHECK (CurrencyCode = N''
               OR CurrencyCode COLLATE Latin1_General_BIN LIKE N'[A-Z][A-Z][A-Z]');
GO
