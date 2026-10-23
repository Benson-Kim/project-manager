# ADR-0029 — Financials calculator: master templates and project snapshots

Status: Accepted · Date: 2026-10-16 · Session: financials-calculator
Replaces the calculator part of the FI1/FI2 prompts (the MSSS document checklist stays for later,
on top of this model). Migration 027 (the number FI1 reserved).

## Context

The client's workbook `docs/source/Financials Calculated.xlsx` holds the financials today:

- **Parameters**: a net tax rate (0.056879: GST 5 % with an 83 % rebate plus QST 9.975 % with a
  51.5 % rebate, a Quebec public body's non-recoverable tax), a 5 % annual increase for recurrent
  costs, the first fiscal year;
- **Budget Execution**: lines in three sections (operating fund, capital fund, other sources),
  each with a cost category, "add tax" O/N, supplier, G/L, source of financing and five fiscal
  years of "Cost before tax" and "Tax included" = `ROUND(ROUND(x,2)*(1+rate),2)`;
- **Monitoring execution budget**: per line, up to four invoices against the first year's budget,
  a balance and a "flag a problem" at 10 %.

The workbook had drifted: "Y" (and a blank) meant no tax because the formula tests "O"; the
escalation rate was never used; monitoring covered year 1 only (its own note asks for 1 to 7
years); 11 of 20 monitoring blocks were `#REF!` after lines were deleted; the flag rule was
`#REF!`; a with-tax total mixed a typed full-tax figure (14.975 %) with the net rate.

The client asked for a calculator with **master** financials (a worked-out template usable for
any project) and **project** financials that manage the specifics.

## Decision

- **Fixed model, no user formulas.** One pure TypeScript engine (`src/modules/financials/calc`)
  computes everything; the planner runs it in the browser as people type, the server runs it for
  the CSV export. Amounts are bigint cents, rates bigint millionths; rounding is Excel's ROUND
  (half away from zero). A tax-included cell is its pre-tax amount times (1 + rate), rounded per
  line per year; totals are sums of rounded cells (the workbook's H11). Golden tests reproduce
  the workbook's figures.
- **Master templates** (`app.FinancialTemplate`): one JSON document per template (horizon 1-7
  years, fiscal-year start month, escalation and flag rates, tax profiles, cost categories,
  funding sources, standard lines), one marked default. Every user reads them; only Admins write
  (`admin:financial-templates` in the action, `usp_User_GetActorRole` in the proc). The document
  is validated by zod and again by `usp_FinancialTemplate_AssertDefinition`.
- **Snapshot only** (user decision): creating project financials copies the template into the
  financial's own settings, tax profiles and lines. Later template edits never reach it; there is
  no sync.
- **Tax profiles** (user decision): named net rates, typed (not derived from GST/QST
  components), fully managed by the user in templates and per financial. A line picks a profile
  or none. Changing a profile's rate re-prices its budget lines.
- **Transactions capture their rate.** An invoice is entered pre-tax (user decision); the proc
  copies the line's current profile rate onto it and never takes a rate from the caller, so a later
  rate change never restates what was spent. Moving it to another line re-captures.
- **Years are keyed, not positional.** Amounts and transactions carry their fiscal year (the year
  it starts in; 2023 = "2023-2024" with an April start). Changing the horizon or the first year is
  refused while amounts or transactions would fall outside it.
- **Recurrent lines** escalate: a year without a typed amount after the line's first typed year
  is the year before times (1 + escalation), rounded; typed years win, a typed 0 stops the chain.
- **Monitoring** per line and year (or all years): budget, spent, balance before tax and tax
  included. The status uses pre-tax figures, as the workbook did, because rounding each invoice's
  tax separately can leave a fully spent line one cent over its rounded tax-included budget:
  over (balance < 0), low (balance at or under the flag share of the budget), unbudgeted
  (spending, no budget), idle, ok.
- **Integrity**: a line with live transactions cannot be deleted (the `#REF!` failure); a profile
  used by a live line cannot be removed; a line's profile and a moved transaction's line must
  belong to the same financial. Quotas: 50 financials per project, 300 lines and 5000
  transactions per financial, 20 profiles. Every write locks the financial row (`UPDLOCK,
  HOLDLOCK`) before its checks, so quotas and the horizon hold under concurrency.
- **Access**: module `financials`. Viewers read; writes need Manager (not a Contributor module),
  and a Manager can grant or revoke create / update / delete per person (ADR-0024;
  `OVERRIDABLE_MODULES` and `usp_ProjectPermission_Set`). Lines and transactions resolve their
  project through their financial inside the proc (`usp_Financial_AssertAccess`).
- **UI**: Settings → Financial templates (editor); project section "Financials" in the Planning
  group: list, "New financials" (template or blank), and a full-route page per financial with
  Budget, Monitoring and Settings tabs (ADR-0010 exception, like the meeting workspace). Lines are
  edited one dialog per line with all years at once; the grid is read-only. The page never
  scrolls sideways at 360 px; the tables scroll in their own box.
  **Amended 2026-10-17 (client feedback):** Financials is its own nav group after People &
  Resources. Its items are the views Budget, Monitoring, Documents and Settings
  (`/projects/<id>/financials/<view>?f=<financialId>`); a project with one financial opens it,
  with several the view lists them to pick from and its header switches between them, and the
  nav keeps `?f=` across views. `/financials/<financialId>?tab=…` redirects there. Cost
  categories and funding sources are edited as rows (the dropdown-list editor's rows, without
  colours) and picked in the app's dropdown (Combobox), not typed with browser suggestions.
  **Amended 2026-10-17 (client feedback, "edit inline like the other modules"):** the budget lines
  and the transactions are datasheets, built from the list modules' cells, header and new-entry
  row (ADR-0023), so they look and behave like every other list. A line's description, cost
  category, source of financing, tax, recurrence and each year's pre-tax amount are edited in its
  row and saved as each cell is left, through the same `updateLineAction` as the line's sheet;
  each section ends with a new-entry row ("[New line…]") instead of an add button and dialog. A
  year's cell shows the escalated amount as ghost text, and its tax-included amount on hover;
  totals keep both amounts. A section's totals row, in the budget and in monitoring, shows only
  its figures under the section's lines; its "Total …" label is read by screen readers only (the
  CSV keeps it). Typed amounts show with thousands separators, as the totals do. Cost category and source of financing end with "Edit list…", and
  their headers carry the caret, as list-bound columns do elsewhere; tax's opens the tax profiles.
  The rest of a line (section, supplier, G/L account, comments) and Delete are in its sheet (↗),
  the side panel every list opens its records in, which replaces the line dialog. Transactions
  work the same way: date, fiscal year, line, reference, description and pre-tax amount in their
  cells, the captured rate on the tax-included cell, a new-entry row to record an invoice, and ↗
  to the transaction's sheet. A date edited in a cell moves a fiscal year that followed the date.
- **Export**: `GET /projects/<id>/financials/<financialId>/export` returns CSV (`src/lib/csv.ts`:
  BOM, CRLF, RFC 4180, formula text neutralised), the file name from the id only. A financial of
  another project than the path's is not found.

## Amendment 2026-10-16: after the combined review

The challenge pass on the finished work raised four points; the user decided:

- **Authorised budget basis per financial**: `app.Financial.BudgetIncludesTax` (default tax
  included). The planner compares the authorised budget with the matching planned total.
- **Tax rate changes by year**: `app.FinancialTaxProfileRate` holds steps "from fiscal year X the
  rate is r" per profile (at most 10). A budget year takes the latest step from that year or
  before, else the profile's rate (`dbo.ufn_FinancialTaxProfile_RateFor`, `rateOf` in the
  engine), so a rate change no longer restates earlier years. An invoice captures the rate in
  force for its own fiscal year; editing it re-captures only when its line or fiscal year changes.
  Templates keep a single rate per profile: steps are a project matter.
- **Separate permission section** `financial-tax-invoices` (label "Financial tax and invoices"):
  tax profiles (update) and invoices (create / update / delete) need Manager or a per-person grant
  of that section. A grant on `financials` (budget lines) no longer lets anyone re-rate taxes or
  change what was spent. The profile save moved to `usp_FinancialTaxProfile_Set`.
- **Escalation confirmed** as built: compounded per year on the pre-tax amount, rounded each year.

## Consequences

- The workbook's figures are reproducible and tested; its known defects cannot recur.
- Projects never move when a template changes. A template fix reaches a project only by
  re-entering it there (by design).
- Re-rating a profile inside a financial re-prices its budget but not its spending; the audit log
  records both.
- The legacy `app.Financial` rows (seed 019) gain default settings and no lines; they open in the
  planner as empty financials.
- `usp_Financial_GetDocumentChecklist` gains its access check; the other financial-document procs
  are not reachable from the app yet and get theirs with the checklist work.
