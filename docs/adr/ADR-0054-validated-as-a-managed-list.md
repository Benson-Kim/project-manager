# ADR-0054 — Validated becomes a managed list

- **Status**: Accepted
- **Date**: 2026-11-02
- **Module**: assumptions-constraints (#13)
- **Supersedes**: nothing. **Superseded by**: nothing.

## Context

Client backlog **BL20** asks for the assumptions & constraints register's
**"customizable Validated/Type options, labels, row/option colours"**. Half of it already
worked: `Type` and `Impact` have been managed lists since ADR-0022, with option colours
(migration 020) and the row tinting the list editor can switch on.

`Validated` was not. It was `app.AssumptionConstraint.IsValidated BIT NOT NULL`
(migration 003, inherited from `tblAssumptionsConstraints`), rendered as a checkbox in the
sheet and a Yes/No cell in the datasheet. A boolean can hold exactly two states that cannot
be renamed, reordered, extended or coloured, so none of what BL20 asks for was reachable from
the list editor — the client could not add a "Partly" or an "In review", and could not colour
a row by whether it is validated.

The question this records is not whether to make it a list. It is what to do with the
boolean column, because that is the part that is hard to reverse.

## Decision

1. **`Validated NVARCHAR(50) NULL`, bound to a new `assumption-constraint.validated` list**
   (migration 053), stored as text like every other listed value. The register now reads one
   column through the same path as `Type` and `Impact`: the same `listColumn` in the
   datasheet, the same `ListSelect` in the sheet, the same `listChoice` in the form contract,
   the same `usp_LookupList_AssertLabel` in the procs, and an entry in the rename cascade in
   `usp_LookupList_Set`, so renaming an option the client added follows into their records.

2. **`Yes` and `No` are locked, and only those two.** They are the labels the derived column
   below reads by name. An Admin may recolour them, reorder them and add options around them;
   they cannot be renamed or removed. `src/tests/lookup-lists.test.ts` holds that list of
   locked labels against what the migrations seed.

3. **A record with no value is `NULL`, shown as "None"** — the same as an unset `Type` or
   `Impact`. Every existing record carried a boolean, so the backfill gives it exactly `Yes`
   or `No` and nothing loses what it said; only records created from now on can be blank,
   which is honest about nobody having answered yet.

4. **`IsValidated` is kept and derived, not dropped.** The write procs set it from the list's
   locked label — `CASE WHEN @Validated = N'Yes' THEN 1 ELSE 0 END` — and no longer accept it
   as a parameter. The read procs no longer return it and no application code reads it.

   This is the consequential choice. Dropping the column would be tidier and would leave one
   source of truth in the table, but it makes the release one-way: a rollback to the previous
   code would hit `INSERT`s against a `NOT NULL` column that no longer exists. No migration in
   this project has ever dropped a column. Deriving it costs one expression in two procedures,
   keeps the rollback path working, and leaves the drop to a later release once nothing has
   read the column for a while. `src/tests/assumption-constraint-sql-guardrails.test.ts`
   fails if a write proc stores one of the pair without the other, or takes `@IsValidated`
   back as a parameter.

   That covers the way back to the previous code, not the way forward again: the previous
   procs write the BIT alone, so a record ticked or unticked while they ran would return with
   its old label. Migration 058 adds `TR_AssumptionConstraint_ValidatedSync`, which corrects
   only a row whose two columns disagree (a ticked BIT means Yes; an unticked one takes Yes
   back to No). The current procs never write such a row, so the trigger changes nothing they
   write, their `RowVer` included.

5. **Row tinting is not switched on by seed.** The capability is what BL20 was missing; the
   switch is in the list editor ("Colour whole rows by this value"), one click for an Admin,
   and migration 020's precedent seeds it only for the priority lists. Turning it on here
   would recolour every row of a register the client has not asked to look different yet.
   Note that when more than one list in a view tints rows, the first such column in display
   order wins (`data-view.tsx`), so `Type` would take precedence over `Validated`.

## Consequences

- The client can add, rename, reorder and colour validation states from the register, which
  is what BL20 asked for.
- `IsValidated` is a derived copy for one or more releases. It is correct but it is not the
  register's value, and the guardrail test is what keeps that true.
- Filtering and sorting still use `Type` and `Impact` only
  (`ASSUMPTION_CONSTRAINT_SORT`, `usp_AssumptionConstraint_List`). Sorting or filtering by
  Validated was not asked for and is not added.
- An Admin who adds a third option gets a register where "not Yes" no longer means "No" in
  the derived BIT. Nothing reads that BIT, so this is only a note for whoever drops it.
