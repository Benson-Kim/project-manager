# ADR-0050 — The risks & issues register

- **Status**: Accepted
- **Date**: 2026-10-30
- **Module**: risks-issues (#14), branch `feature/risks-issues`
- **Supersedes**: nothing. **Superseded by**: nothing.

## Context

`app.RiskIssue` and five `usp_RiskIssue_*` procedures have existed since module #3
(migration 003, seed 015 — two migrated rows from `tblRisksIssuesTracker`). Nothing was
ever built on top of them, so the client's sheet records **"The Issues/Risk page was not
created"**, carried forward as the work item **"Build the Risks/Issues page."**

The scaffolded procedures were written before ADR-0016 (the list contract), ADR-0021
(per-project access), ADR-0022 (managed dropdowns), ADR-0023 (the datasheet) and ADR-0024
(per-person overrides). Concretely, **none of the five checked access at all**: any signed-in
user could read, edit or delete any project's risks by id. That is the main thing this
change fixes; the page is the visible part.

## Decision

1. **Follow the assumptions & constraints recipe exactly** — it is the closest mature
   register (project-scoped, list-driven, no child entities). Same slice shape
   (`actions`/`components`/`repository`/`schemas`/`tests`), same DataView + datasheet + Sheet,
   same page composition. Nothing about the module is novel, deliberately.

2. **Bring the five procedures up to the current contract** rather than writing new ones.
   `usp_Project_AssertAccess` on every one (Viewer to read, Contributor to write, Manager to
   delete, each naming its own permission so a Manager's per-person override decides —
   ADR-0024); `ActorAccess`/`ActorGrants`/`ActorRevokes` and the cross-project filter on the
   list; `ProjectId` immutable on update; the rowversion check moved inside the delete's
   transaction.

3. **The five dropdowns become managed lists** (migration 049): `risk-issue.category`,
   `.status`, `.priority`, `.impact`, `.probability`. Migrated values that are not seeded
   options are **adopted as options** rather than left dangling, so no existing record loses
   its value or becomes unsaveable.

4. **Four labels are locked, and only four.** `Risk` and `Issue` are the two kinds of record
   the register holds (the same reasoning that locks `assumption-constraint.type`); a new
   record starts `Risk`/`Open`; and `Closed` mutes the row, exactly as a `Resolved` parking
   lot item is struck through (migration 031). Priority, impact and probability lock nothing
   — the code never reads those labels by name, so an Admin may rename or extend them freely.

5. **No computed severity.** A risk matrix over impact × probability was considered and
   rejected: the client did not ask for it, and it would have forced six more locked labels,
   making the two scales unextendable for a feature nobody requested. The two columns are
   shown as they are. This is reversible — it costs a pure function and the locks, no
   migration.

6. **Description and MitigationPlan take formatting** (ADR-0025). The migrated rows already
   hold HTML in both (`<div>…</div>`), so treating them as plain text would have shown the
   markup. `Description` is therefore a required rich-text field, which is new: every other
   module's primary column is plain. Its plain reading, for the row label, the sheet title
   and the delete confirmation, comes from a new shared `richTextToPlain()` beside
   `asRichText()`.

7. **A record is raised before it falls due**, so `DueDate` may not precede `DateIdentified`.
   The rule lives once in the form schema (`datesInOrder`) and again in the Create and Update
   procedures, with the same stored-pair exemption the suppliers module uses, so a record
   migrated with inverted dates stays editable.

8. **Default order is the order they were raised in** (the proc's `RiskIssueId` fallback), not
   a date. Sorting by a date column is offered; making one the default would put every
   undated record at the top, because SQL Server orders `NULL` first ascending.

## Consequences

- `risks-issues` joins `CONTRIBUTOR_WRITE_MODULES` and `OVERRIDABLE_MODULES`, so it appears in
  the project team's permission cog and `usp_ProjectPermission_Set` accepts it.
- The section sits in the **Planning** nav group, after assumptions & constraints.
- `src/tests/proc-access-levels.test.ts` now reads `db/procs/risk-issue`, which it previously
  skipped — that is what makes the access rule permanent rather than written down.
- Five more managed lists is five more rename cascades in `usp_LookupList_Set`.

## Alternatives considered

- **Leave the procedures and wrap them.** Rejected: the access hole is in the procedures, and
  the stored-procedure-only rule means a repository cannot close it.
- **A separate Risks page and Issues page.** Rejected: one table, one client phrase
  ("Issues/Risk page"), and `Category` already separates them with a filter.
- **Add a `Title` column so the primary field stays plain text.** Rejected: it invents a field
  the client never asked for and leaves the migrated HTML with nowhere to go.
