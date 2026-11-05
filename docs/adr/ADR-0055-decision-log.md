# ADR-0055 — The decision log

- **Status**: Accepted
- **Date**: 2026-11-03
- **Module**: decisions (new)
- **Supersedes**: nothing. **Superseded by**: nothing.

## Context

Client backlog **BL36** asks for a **decision log**: a register, per project, of the
decisions a project takes — the problem, the options weighed, what was chosen and why, who
owned it, who was consulted, what it affected, and what happens next. The client's own
words name a status (`Proposed`, `Approved-Final`, `Overturned-Superseded`) and a set of
impacted areas (`Scope`, `Budget`, `Timeline`, `Architecture`, `User experience`).

Three things about the shape of the data drive this record.

A decision is **cited by number**. Minutes say "as per DEC-004", so the number has to be
stable, per project, and never reused — a number that could be handed to a second decision
after the first was deleted would make an old set of minutes point at the wrong record.

A decision **affects several areas at once** and **consults several people at once**. Both
are sets, not columns, so neither fits the one-column-per-value shape the rest of this
schema uses for list-bound values.

A decision can be **replaced by a later one**. The client's `Overturned-Superseded` label
carries that meaning in a word, but a label cannot say *which* decision replaced it, and a
label the code reads by name can never be renamed by an Admin again (ADR-0022).

## Decision

**Three tables (migration 057).** `app.Decision` holds the decision; two link tables,
`app.DecisionImpactedArea` and `app.DecisionStakeholder`, hold its two sets. The link
tables are part of the Decision aggregate, not records in their own right: they carry no
`RowVer`, no `IsDeleted` and no `UpdatedAtUtc`, they are written only through the decision's
own write procs, and they survive a soft delete so restoring a decision restores what it
touched and who was asked.

**Both sets are stored as labels, not option ids.** `app.DecisionImpactedArea.Label` is
`NVARCHAR(50)`, bound to the managed `decision.impacted-area` list exactly as every other
list-bound value in this schema is bound, so a rename reaches it through the cascade in
`dbo.usp_LookupList_Set`. The alternative — storing `LookupOptionId` and adding the list to
`ID_BOUND_LISTS` — would have dodged the cascade, but it would have left two different ways
to multi-select from a managed list in one codebase. The hazard it dodges is not real: the
list editor already refuses two options with the same label, so a rename can never collide
with `UQ_DecisionImpactedArea_Pair`.

**`DecisionNumber` is assigned under the project's row lock** (`UPDLOCK, HOLDLOCK`) inside
the insert's transaction, as the next number above every row of that project *including
deleted ones*. `UQ_Decision_Number (ProjectId, DecisionNumber)` is therefore **not** filtered
on `IsDeleted`, unlike the other uniques in this schema: a number is spent for good.

**Supersession is a foreign key, not a status.** `SupersededByDecisionId` says which
decision replaced this one. Because the fact lives in its own column, all three status
options stay renameable, reorderable and retirable by an Admin — nothing in the code reads a
decision's status by name, so **none of the eight seeded options is locked**. Two guards keep
the pointer honest: `CK_Decision_NotSelf` in the schema, and a chain walk under the row lock
in `usp_Decision_Update` that refuses to close a loop.

**Every cross-entity invariant is a database constraint, not a proc check.** The owner
(`OwnerStakeholderId, ProjectId`), the superseding decision (`SupersededByDecisionId,
ProjectId`) and both link tables' ends reference composite uniques, so "everything in one
decision belongs to one project" cannot be forged by any caller, in any proc, ever. The
procs add only what a key cannot express: that the referenced row is not soft-deleted.

**The two sets are replaced by internal procs** — `usp_Decision_ReplaceImpactedAreas` and
`usp_Decision_ReplaceStakeholders`, following `usp_Requirement_ReplaceTraces` (ADR-0037).
Each refuses to run outside a transaction (`@@TRANCOUNT = 0` → `50004`), reads the project
from the row rather than the caller, asserts no access of its own because its parent already
did, and audits its own change. Both are listed in `EXEMPT` in
`src/tests/proc-access-levels.test.ts`; a guardrail fails if any TS file calls them.

**Writes use the Set-flag pair.** `usp_Decision_Update` takes `@ImpactedAreasSet` /
`@StakeholderIdsSet` alongside the JSON. A datasheet cell edit sends scalars and no set, so
the flags stay `0` and the links are left exactly as they are; the form sends both flags as
`1` and owns the whole set. Without this, editing one cell in the register would silently
empty a decision's impacted areas.

## Consequences

A decision and its two sets commit together or not at all, and each half of the write audits
itself, so the log reads as one history.

`decisions` joins `CONTRIBUTOR_WRITE_MODULES` (a Contributor logs a decision; deleting one
needs a Manager) and `OVERRIDABLE_MODULES` (a project Manager can grant or revoke the section
per person), which also puts it in `SECTION_LABELS` and in the module list inside
`dbo.usp_ProjectPermission_Set`.

Both sets travel on the decision's own row as `FOR JSON PATH` sub-selects, so the register
and the form each read one result set instead of fetching links per row. The cost is bounded
by the page, which is capped at 100 rows.

`@ImpactedArea` on the list proc answers "which decisions touched Budget" off
`IX_DecisionImpactedArea_Project_Label`.

### Left out on purpose

Search covers `Title` and `Status`. The four long prose fields are `NVARCHAR(MAX)` with no
full-text index, so searching them would mean a scan of every decision in the project; if the
client asks for it, that is a full-text index, not a widened `LIKE`.

The client's `Approved-Final` and `Overturned-Superseded` are seeded as **`Approved`** and
**`Overturned`**. The compound words describe the status *and* its consequence, and the
consequence now has its own column. Nothing reads these by name, so an Admin can rename them
back in one click if the client prefers the longer form.
