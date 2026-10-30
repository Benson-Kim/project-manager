# ADR-0051 — A financial's currency, or no currency symbol at all

- **Status:** Accepted
- **Date:** 2026-10-31
- **Supersedes:** nothing. Amends 0029 (the snapshot model carries one more setting) and extends
  0030 (the CSV outputs). Answers the client's carry-forward note on p.33 and p.12 of the test
  sheet: figures showed no currency and there was no way to choose one.

## Context

Every figure in the financials module rendered bare — `1,234.56` — because the module was built
from one organisation's workbook, where the currency went without saying. The client asked to
choose a currency, and asked for the choice to be "auto generated, detecting the location of the
particular user and suggesting that as the first currency, others maintained in a list that auto
updates everytime".

Two constraints shaped the answer. ADR-0029 forbids floats: every amount is a bigint of cents, so
whatever supplies a symbol must not touch the figure. And the same budget is read on the server, in
a browser and in a PDF, so a currency that resolved differently per viewer would drift on hydration
and between two people reading one sheet.

## Decisions

1. **The currency belongs to one financial sheet**, not to a project and not to the app:
   `app.Financial.CurrencyCode` (migration 050), edited in the Parameters panel, with the master
   template carrying the default that new financials copy — exactly how `EscalationRate`,
   `FiscalYearStartMonth` and `BudgetIncludesTax` already work under 0029's snapshot model. Two
   financials of one project may be in different currencies, and one of them may be in none.
2. **No currency is the default and a first-class choice**, stored as `N''` and labelled
   "No symbol". A sheet that never chooses renders exactly as it does today, which is what every
   existing assertion in the suite continues to prove.
3. **The list comes from the platform's ICU data at runtime**, through
   `Intl.supportedValuesOf("currency")` and `Intl.DisplayNames` (`src/lib/currency/currencies.ts`).
   It is never hand-maintained, so it updates when the runtime does. Only the two tables Intl does
   not expose — region-to-currency and IANA-zone-to-region — are generated, by
   `scripts/generate-currency-data.mjs`.
4. **Symbols and names resolve under a fixed locale** (`SYMBOL_LOCALE = "en"`), like
   `src/lib/format.ts` and the layout's date format. The viewer's locale decides nothing: a figure
   must read the same everywhere, and the narrow symbol is what goes in front of the amount.
   **Intl supplies the symbol and never the figure** — the number is still assembled from the
   bigint, so no amount passes through a float.
5. **The suggestion comes from the user's IANA time zone**, falling back to their language tag's
   region only when the zone resolves to nothing. The zone is the honest location signal and a
   language tag is a language preference: an `en-US` desktop in Nairobi would otherwise be offered
   US dollars. No IP lookup, no external service, no permission prompt. It reads the viewer's
   environment, so it is client-only — `useSyncExternalStore` with `NO_CURRENCY` as the server
   snapshot, which also keeps it out of render.
6. **Validation is by shape, never by membership of a list.** `/^[A-Z]{3}$/` in zod, the same three
   characters in SQL. Checking a code against `Intl.supportedValuesOf` would make a code stored on
   one machine invalid on another, because ICU builds differ between Node and a browser; an unknown
   code still renders, because `currencySymbol` falls back to the code itself.
7. **One normalisation rule, applied in the same order in both layers.** `usp_Financial_Update`
   does `UPPER(LTRIM(RTRIM(...)))` and *then* checks the shape, so `'eur'` is accepted and stored as
   `'EUR'`. zod's `normaliseCurrency` trims and upper-cases first for the same reason, and both
   `currencySchema` and `storedCurrencySchema` judge the shape only after it. Were the orders to
   differ, the layer in front would silently discard a value the layer behind accepts. The display path stays strict on purpose: a stored lower-case code cannot exist, so
   `currencySymbol("usd")` is `""`.
   **A misshapen code is refused, not blanked.** Reading `"nonsense"` as no symbol would reset a
   configured currency exactly as an omitted field would, and both procs throw on one. The one
   place that still reads leniently is a stored template document, which may predate the field and
   is nobody's choice at the point it is read; `usp_FinancialTemplate_AssertDefinition` is the gate
   on what may be written there.
   **`@CurrencyCode` is declared `NVARCHAR(20)`, far wider than the three characters it accepts**,
   for the same reason `@Title` is `NVARCHAR(300)` for a 150-character title. A parameter sized to
   the value truncates an oversized code at binding, before any check in the proc can run, so
   `N'EURO'` would arrive as a well-shaped `N'EUR'` and store as a different real currency with no
   error anywhere. Declare wide, then refuse. The column stays `NVARCHAR(3)`, where an oversized
   write raises 8152 rather than truncating. The vectors for this one rule live in
   `src/modules/financials/tests/currency-vectors.json` and are read by **both** the zod test and
   the proc test, so the two implementations of one spec cannot drift apart (`dry.md`).
8. **`CK_Financial_CurrencyCode` is the second gate**, and it collates:
   `@CurrencyCode COLLATE Latin1_General_BIN NOT LIKE N'[A-Z][A-Z][A-Z]'`. Under the database's
   case-insensitive collation an `[A-Z]` range also matches `a-z`, so without the `BIN` collation
   the constraint would admit exactly the lower-case codes it exists to refuse. This is the house
   idiom from `022_file_attachment.sql`. **Do not simplify the collation away.**
9. **The sheet's update is a full replacement, so `currency` is required in its contract.** Every
   other field of `updateFinancialInput` is required and the Parameters panel sends the whole of
   `breakdownValues(f)` in one call. An optional `currency` parsed clean when omitted, yielded `""`,
   and the proc wrote `N''` — a configured currency silently reset to no symbol, with no error
   anywhere (engineering standards #5). The template document keeps its own optional schema,
   `storedCurrencySchema`, because a template written before this field must still parse. Two
   presence policies, one rule.
10. **On screen the symbol goes in front, inside the existing parentheses for a negative**:
    `$1,234.56` and `($1,234.56)`. `formatMoney(cents, currency?)` takes the code, and **every call
    site inside the module passes it**, including the two that must stay bare — an amount input's
    value and its placeholder, which pass `NO_CURRENCY` explicitly so what is shown parses back.
    `src/tests/money-currency-guardrails.test.ts` fails when a call site passes one argument. Since
    no call site is exempt, the guardrail needs no allowlist and cannot rot.
11. **In CSV the currency names the money columns, never the cells.** A header reads
    `2023-2024 Before tax (USD)` and the cell stays the raw decimal, so the export still opens as
    numbers in a spreadsheet. This was the client's explicit choice over symbols inside cells.
12. **The project export carries a `Currency` column instead of header suffixes.**
    `projectCsvRows` writes one row per financial and each financial has its own currency, so no
    single header could name one without naming the wrong one for some row.

## Consequences

- A sheet's figures change the moment its currency is saved, in the planner, the monitoring panel,
  the transaction sheet, the print view, the PDF and the document suggestions. The stored amounts do
  not change: a currency is a label on the figures, not a conversion. **There is no FX rate
  anywhere in this decision**, and a sheet whose currency is changed after amounts are typed will
  show the same numbers under a new symbol.
- The financial CSV's budget header comes out doubly parenthesised —
  `Authorised budget (tax included) (USD)`. The inner pair predates this work. It reads acceptably
  and one uniform suffix rule is worth more than a special case, so it stands, asserted literally in
  `tests/export.test.ts`.
- **The template cannot set the default yet.** The contract field, the proc's validation and the
  copy in `usp_Financial_Create` are all in place and tested, but the template editor has no
  currency control, so every new financial starts at no symbol and the choice is made per sheet.
  Adding the control later is a one-component change and needs no migration.
- `migration 050` is idempotent (`COL_LENGTH`) and the column is `NOT NULL DEFAULT N''`, so existing
  rows need no backfill and a redeploy is safe.
- Currency names in the picker come from the runner's ICU data, so a label can differ between
  platforms. Tests and e2e select **by value**, never by label.
- `db/tests/financials-procs.cjs` covers the proc and the constraint, including error 547 from a
  direct write, which the proc path cannot reach. It needs a real database and runs in CI's
  `db-apply` job only.

## Alternatives rejected

- **A managed lookup list**, like the project's other option lists. Its options carry a label and a
  colour, not a code-and-symbol pair, and it would have to be maintained by hand for ever — the
  opposite of what the client asked for.
- **A free-text symbol field.** It accepts typos silently and gives nothing to format a PDF or a
  CSV header from.
- **Per-project or app-wide scope.** The client's own sheets show one project holding financials
  that are not all in one currency, and app-wide scope cannot express that at all.
- **Validating against `Intl.supportedValuesOf("currency")`.** Decision 6: ICU builds differ, so
  this would let a machine reject what another machine stored.
- **The browser's locale as the location signal.** Decision 5: it is a language preference, not a
  location.
