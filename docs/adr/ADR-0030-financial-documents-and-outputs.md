# ADR-0030 — Financial document checklist, print view, PDF and CSV outputs

Status: Accepted · Date: 2026-10-16 · Session: financials-calculator (document checklist)
On top of ADR-0029 (calculator). Completes the FI1/FI2 prompts: the MSSS document checklist of PPTX
slide 2 ("Financial Documents Required?"), the printable record (rptFinancials) and the tracking
export (checklist row 64). Migration 034 (028-030 stay reserved for F2, A2 and RP1).

## Context

The Access app kept a fixed lookup of nine MSSS documents (`tblFinancialDocuments`, partly misspelt)
and one junction row per financial and document: required yes/no and "Reason for not creating the
DA or DAS OR DO?". The deck's reasons are threshold rules ("< 200,000 $: no documentation per the
MSSS", "non-capitalizable: no DA or DAS"), which the requirements keep as **reason fields, not hard
rules** (requirements.md section 6). The five ported `usp_FinancialDocument_*` procs had no access
check, and `_Update` took `@FinancialId` from the caller, so any row could be read, changed or moved
to any financial (BOLA). The client wants master templates and project specifics (ADR-0029).

## Decision

User decisions of 2026-10-16 (the-fool pass), never re-asked:

1. **Template-managed list, snapshot per financial.** A template's document carries a name, a
   default required flag and reason, and suggestion rules. Creating a financial from a template
   copies them; later template edits never reach it. A financial adds, renames, reorders and removes
   its own documents, and can copy a template's documents later (names it already lists are
   skipped). The nine MSSS documents become the default template's list (display spellings
   corrected); `app.FinancialDocumentType` stays as the legacy lookup for provenance.
2. **Advisory suggestions, measured on the whole budget.** Two rule kinds, at most one of each per
   document: `budgetBelow` (amount) and `noCapital`. The budget is the authorised budget when one is
   entered, else the planned total on the financial's basis (tax included or before tax);
   `noCapital` matches when something is planned and none of it is in the capital fund. A matching
   rule shows its reason with why it matched, and one click copies it into an empty reason (only for
   a document not marked Required; it never flips Required). Nothing is ever enforced.
3. **Access reuses `financials`.** Viewers read and download; adding a document is
   `financials:create`, editing or moving it `financials:update`, removing it `financials:delete`.
   Attachments are an ADR-0026 owner, `financial-document`, with `financials:read` and
   `financials:update` (Manager by default, per-person overrides apply).
4. **Outputs**: a print view, a PDF download, documents appended to the per-financial CSV, and a
   project-wide CSV with one row per financial and one column per document name.

5. **The project charter's switches stay independent** (combined review): DO, DA, DAS, A1,
   Purchase order and Requisition on the Project form are not linked to any financial's checklist;
   each is edited on its own.

Own decisions:

- **Required is tri-state**: NULL means not decided yet. The list shows "n required · m with file ·
  k not decided" instead of "n/9", which would read nine "not required" rows as complete.
- **Names are unique per financial, case-insensitively** (the collation): `documentNameKey` in zod
  and the UI pre-check match `UQ_FinancialDocument_Name`, so a duplicate never surfaces as a generic
  error. The project CSV groups columns the same way.
- **Integrity**: every write locks the financial row first; at most 50 documents per financial;
  name 1-200, reason up to 2000; suggestions checked by `usp_FinancialDocument_AssertSuggestions`
  and again by zod. Removing a document soft-deletes its attachments; deleting the financial
  cascades both. No document proc takes a project, and only the two that add documents take a
  financial (`tests/document-procs.test.ts`).
- **Legacy procs dropped in the migration** (`usp_FinancialDocument_GetById`, `_List`,
  `usp_Financial_GetDocumentChecklist`): deleting their files would have left them in existing
  databases. `_Create/_Update/_Delete` are rewritten under the same names.
- **The sheet carries the checklist**: `usp_Financial_GetSheet` returns the documents (set 6) and
  their attachments (set 7), so the tab, the print view, the PDF and the CSVs read one shape.
- **PDF without a dependency** (ADR-0014's supply-chain stance): `src/lib/pdf.ts` writes A4 pages
  with the standard Helvetica fonts in WinAnsi, wrapped text and paged tables. Its output is pure
  ASCII: `( ) \` are escaped, other bytes are octal, control characters become spaces and characters
  WinAnsi lacks become "?"; no JavaScript, links, forms or embedded files. The route answers with
  `Content-Disposition: attachment` (file name from the id only), `no-store`, `nosniff` and a
  `default-src 'none'; sandbox` CSP. The print view uses the browser's print dialog (save as PDF
  there too), which works in the desktop edition.
- **One report model** (`calc/report.ts`) feeds the print view and the PDF, so they never disagree.

## Consequences

- A template fix reaches a financial only by copying documents again or editing them there.
- Characters outside WinAnsi (e.g. CJK) print as "?" in the PDF; the print view shows them.
- The project CSV reads one sheet per financial (at most 50, four at a time).
- Tests: `tests/documents.test.ts`, `tests/report.test.ts`, `tests/document-procs.test.ts`,
  `src/lib/tests/pdf.test.ts`; e2e `financial-documents.spec.ts` and `financials-rbac.spec.ts`.
  Local DB checks: `.agent-scratch/financials/doc-check.cjs` (72) and `race-check.cjs` (5).
