# ADR-0037 — Requirement types, a project register, and traceability to deliverables

Status: Accepted · Date: 2026-10-22 · Session: wbs-requirements (requirement traceability)
Amends ADR-0036 (requirements under each deliverable) and ADR-0027 (WBS and Gantt).
Amends ADR-0003 (the action wrapper) for the failure reference in §7.
Builds on ADR-0011 (soft delete, RowVer, audit), ADR-0012 (the THROW registry), ADR-0016 (the list
proc contract), ADR-0021/ADR-0024 (per-project access and per-person overrides) and ADR-0023
(datasheet mode).

## Context

ADR-0036 gave each WBS item its own list of requirements: a row of `app.KeyDeliverableRequirement`
belonged to exactly one deliverable, was functional by nature, and had no identity of its own.

That model cannot say the things a project actually has to say:

- a requirement has a **kind** — the business need, the stakeholder's need, and the functional,
  non-functional and transitional answers to them;
- one requirement is often delivered by **several deliverables**, and the same requirement must not
  be retyped (and separately ticked) under each one;
- a solution requirement exists to **satisfy a need**, and the project has to be able to show that
  every need is covered and how far;
- people refer to a requirement by a **reference** ("FR-3"), which must be stable and must not be
  handed to a different requirement later;
- taking a requirement off one deliverable is a **reallocation**, not a deletion, so it must not
  destroy the requirement, its wording, its tick or its links.

## Decision

### 1. Five types, two sides

`src/modules/requirements/schemas/requirement-types.ts` is the single catalog:

| Side | Types | May be ticked "met" | Allocated to deliverables | Validates a need |
|---|---|---|---|---|
| Need | `BR` business, `SR` stakeholder | no | no | no |
| Solution | `FR` functional, `NFR` non-functional, `TR` transitional | yes | yes | yes |

The catalog order (BR, SR, FR, NFR, TR) is the register's default sort. `NEED_TYPES` and
`SOLUTION_TYPES` are the two source lists; `REQUIREMENT_TYPES`, `isNeed`, `isSolution`,
`requirementTypeSchema` and `solutionTypeSchema` all derive from them, and
`src/tests/requirement-sql-guardrails.test.ts` fails if any `RequirementType IN (…)` list in
migration 036 or `db/procs/requirement/**` is not exactly one of those three sets.

### 2. A requirement is a project-level record (migration 036)

`app.Requirement`: `ProjectId` (required), `RequirementType`, `Number`, `Requirement`
(≤ 4,000 characters), `IsMet`, soft delete, audit columns and `RowVer` (ADR-0011).

- `CK_Requirement_Type` lists the five codes; `CK_Requirement_Met` allows `IsMet = 1` only for a
  solution type, so a need cannot be ticked even by a direct write.
- **References are numbered per project and per type, and are never reused.** `Number` is
  `MAX(Number) + 1` for that project and type, **counting soft-deleted rows**, taken under the
  project lock, and `UX_Requirement_Number (ProjectId, RequirementType, Number)` makes a duplicate
  impossible. Deleting FR-3 does not free "FR-3"; a type change takes the next free number of the
  new type and does not keep the old one.
- `UQ_Requirement_Project (RequirementId, ProjectId)` exists so the two link tables can carry
  composite foreign keys and a child can never point at another project's row. The same reason adds
  `UX_KeyDeliverable_Id_Project` to `app.KeyDeliverable`, whose `ProjectId` is nullable.

### 3. Traces run solution → need

`app.RequirementTrace (ProjectId, RequirementId, ValidatesRequirementId)`, primary key on the pair.

- `RequirementId` is the **solution**, `ValidatesRequirementId` the **need** it validates. The
  direction is one-way and is enforced at write time: only `BR`/`SR` may be on the validated side,
  only a solution may be on the validating side.
- `CK_RequirementTrace_Distinct` refuses self-validation; both composite FKs keep the pair inside
  one project. There is no cascade (two cascading FKs to one table is error 1785) — the delete proc
  removes the links in its own transaction.
- **Coverage** is derived, never stored: a need with no validating solution is "Not validated", with
  some met is "m of n met", with all met is "Validated" (`coverageOf` in `requirement-rules.ts`).
- A requirement's type may only change to a type its existing links and allocations allow.
  `compatibleTypes` offers exactly those in the UI, and `usp_Requirement_Update` re-checks the
  **resulting** state after writing the scalars and both lists, so one save that changes type and
  links together is judged as a whole and a refusal rolls all of it back.

### 4. Allocation to deliverables, with one shared tick

`app.RequirementDeliverable (ProjectId, RequirementId, KeyDeliverableId, SortOrder, RowVer)`,
primary key on (requirement, deliverable).

- A requirement may be allocated to **any number of deliverables**, ordered per deliverable.
- The wording and the met tick live on the requirement, so they are **shared**: ticking FR-3 under
  one deliverable ticks it everywhere, and `applyRequirementEdit` updates every item that lists it
  in the editor's optimistic state too.
- **`RowVer` per allocation.** `app.RequirementDeliverable` carries its own `RowVer`, so a move or a
  remove is concurrency-safe for that one allocation (`placeRowVer` in the client), while wording and
  the tick save against the requirement's own `RowVer`. Two people reordering two different
  deliverables do not conflict; two people reordering the same one do.
- **Removing is unallocating.** `usp_Requirement_Unallocate` deletes the allocation, renumbers that
  deliverable's list, touches the requirement row so the Gantt freshness stamp moves, and audits
  `Unallocate`. The requirement, its wording, its tick and its links stay in the register. Deleting a
  deliverable does the same for its whole branch (`usp_KeyDeliverable_Delete`) and never soft-deletes
  a requirement.
- Deleting a requirement is the register's own act (Manager, `requirements:delete`): it soft-deletes
  the row, removes every link in both directions and every allocation, renumbers each deliverable
  that lost one, and keeps all of it in `BeforeJson`.

### 5. Procs: `db/procs/requirement/`

Every write follows the house order (ADR-0012, ADR-0027 §4): read the row → resolve its project from
the row → `usp_Project_AssertAccess` → cheap input checks → `RowVer` pre-check → `BEGIN TRAN` → lock
`app.Project` with `(UPDLOCK, HOLDLOCK)` → every check that reads another row → write guarded by
`CAST(RowVer AS BIGINT) = @RowVer` → audit row → `COMMIT`.

| Proc | Level and permission |
|---|---|
| `usp_Requirement_List`, `_GetById`, `_ListOptions` | Viewer |
| `usp_Requirement_Create` | Contributor, `requirements:create` |
| `usp_Requirement_Update`, `_Move`, `_Unallocate` | Contributor, `requirements:update` |
| `usp_Requirement_Delete` | Manager, `requirements:delete` |

- `dbo.ufn_Requirement_Links` is an inline table-valued function that builds the three JSON columns
  (`ValidatesJson`, `ValidatedByJson`, `DeliverablesJson`) once, so `_List` and `_GetById` cannot
  drift apart. `_List` pages in a CTE first and builds the JSON for the page's rows only.
- **The two helper procs are exempt from the access self-check.**
  `usp_Requirement_ReplaceTraces` and `usp_Requirement_ReplaceAllocations` run **inside their
  caller's transaction, after that caller's own access check**, so they assert no access of their
  own; they `THROW` when `@@TRANCOUNT = 0`, take the project and the side **from the requirement row,
  never from the caller**, bound each list at 200, refuse duplicates, self-validation, a need on the
  wrong side and any id outside the row's project, and answer alike for a missing id and another
  project's id. They are listed in `EXEMPT` in `src/tests/proc-access-levels.test.ts`, following
  `usp_KeyDeliverable_RollUp`, and a guardrail fails if any application file names them. A self
  check was rejected because it would have to name `requirements:update`, which would wrongly refuse
  a *create* by someone whose update right is revoked.
- `usp_KeyDeliverable_GanttData`'s freshness stamp (ADR-0027 §5) is now the greatest of the newest
  `app.KeyDeliverable`, `app.Requirement` and `app.RequirementDeliverable` `RowVer` in the project,
  so a register edit or an allocation change reorders reads exactly as an item edit does.

### 6. Permissions and the migration

- `requirements` is its own section: added to `CONTRIBUTOR_WRITE_MODULES` and `OVERRIDABLE_MODULES`
  (`src/lib/auth/rbac.ts`), to the permission matrix, and to the module list
  `usp_ProjectPermission_Set` accepts. A Contributor may therefore work on requirements without the
  right to change deliverables, and the reverse.
- Migration 036 moves every 035 row across in one transaction under `TABLOCKX`: each becomes an
  `FR`, numbered per project in creation order, keeping its id so audit history still matches; a row
  under a deleted item is copied as deleted; live rows under live items keep their allocation. A row
  whose deliverable has no project, or any count mismatch, **rolls the move back** rather than losing
  data. It then drops `app.KeyDeliverableRequirement` and the four 035 procs, and copies each
  person's `key-deliverables` override to `requirements` so explicit permissions survive the rename.

### 7. The register, the cascade, and the failure reference

- **The register** is at `/projects/[id]/requirements`: a DataView datasheet (ADR-0023) over
  `usp_Requirement_List`, paged and searched in SQL. Wording, the met tick and an unlinked row's type
  are edited in a cell; links and allocations are the sheet's, because each needs the whole picture.
  `?type=` filters and starts a new row's type, `?id=<n>|new` opens the sheet, and selecting needs
  offers **Merge into a new requirement**, which opens a new solution pre-linked to them
  (`?validates=1,2`). Its derivations live in a DOM-free `register-model.ts` (ADR-0013).
- **The cascade** in the WBS and the Gantt keeps ADR-0036's shape, with three changes: a chip in
  front of the wording says which requirement of the register it is ("FR-3", or the type alone until
  the server has given a queued one its number); the add field has a type select offering
  `SOLUTION_TYPES` only, which remembers the last choice; and the × is "Remove from this
  deliverable", gated on `requirements:update`, with no confirmation, because it only unallocates.
  The delete-deliverable dialog says how many requirements it will unallocate and that they stay in
  the register.
- **The failure reference** (amends ADR-0003). A failure past the schema parse logs exactly one
  line — `[action] failed: { action, code, reference, userId, reason?, stack? }` — where `reference`
  is four CSPRNG bytes as hex, fresh per failure. `INTERNAL` and any unmapped code return
  `errors.internalWithReference(reference)`, so the user can quote what the log holds; a mapped code
  keeps its own copy, so a proc's `VALIDATION` text still never reaches the client (LESSONS §30).
  The schema-parse failure is deliberately not logged: it is pre-session, so it belongs to no user id,
  and the form already shows it per field.

## Consequences

- **`app.KeyDeliverableRequirement` is gone.** A desktop app older than 036 that still calls
  `usp_KeyDeliverableRequirement_*` will fail; unlike ADR-0027 §6's retained `Color` column, there is
  no compatibility path, because the row's identity itself changed. Migration 036 drops those four
  procs so the failure is immediate and obvious rather than silent.
- The WBS and Gantt cascade can only create solution requirements. A need is created in the register.
- A deliverable's requirement list is an allocation order, not ownership: the same requirement can
  appear under several deliverables, and its tick and wording move together everywhere.
- The register's list proc pages and searches in SQL and its JSON is built for the page only, so cost
  grows with the page, not the project. `ufn_Requirement_Links` runs three correlated sub-selects per
  row on the page; at a page size of 25 that is bounded, and both link tables are indexed for it.
- A requirement allocated to a deliverable is read by the Gantt through `solutionTypeSchema`, so a
  need that somehow reached an allocation fails the read loudly instead of being drawn. The procs make
  that state unreachable; the choice is deliberate fail-closed behaviour, not an oversight.
- Coverage and the met tick are reporting inputs the reports module (#21) can use without new storage.

## Two project-wide findings

Both were found by reading our own code against the secure-coding checklists in
`~/.claude/CLAUDE.md`, and both belong to the whole code base rather than to this feature.

1. **A list search did not neutralise every LIKE metacharacter — fixed project-wide.** Seventeen
   procs escaped `\`, `%` and `_` before `LIKE … ESCAPE N'\'` but left `[`, so a search for a
   literal `a[1]` was read as a character class and found nothing. Counting the procs by the
   *predicate* rather than by the fix then turned up seven more — `usp_Note_List`,
   `usp_NoteTab_List`, `usp_User_List`, `usp_RiskIssue_List`, `usp_ItResourceCategory_List`,
   `usp_ItResourceItem_List`, `usp_ExistingSystemInterface_List` — that searched with no escaping
   and no `ESCAPE` clause at all, so a search for `50%` matched every row. Neither case was
   injection: the search has always been a parameter, never concatenated into a statement. All
   twenty-four now run
   `REPLACE(REPLACE(REPLACE(REPLACE(@Search, N'\', N'\\'), N'%', N'\%'), N'_', N'\_'), N'[', N'\[')`
   and end each predicate with `ESCAPE N'\'`; `src/tests/list-search-escape.test.ts` fails the build
   if a proc ever searches without both, and the requirement and meeting guardrails pin the chain
   for their own procs.
2. **`NOT_FOUND` is thrown before `usp_Project_AssertAccess` in the row writes — open.**
   `usp_Supplier_Update` documents the reason — do not enter the transaction for a row that is not
   there — so it is a decision, not an oversight; but it does let any signed-in user tell an id that
   exists from one that does not in a project they cannot read. The per-user action rate limit
   (ADR-0031) blunts it. [ADR-0040](ADR-0040-row-access-answers-alike.md) now proposes how to close
   it, and corrects this finding: the distinction lives in one branch of `usp_AccessLevel_Require`,
   so a non-member answers NOT_FOUND where they answer FORBIDDEN_ROW today and no proc changes its
   order — it does not touch every module's write procs. Still open here on purpose: that decision
   and the seven `db/tests` assertions it moves belong to its own branch, not to this feature's.

## The whole-work defensive review

Before the work was called done, every file it touches was read once more against the
engineering-standards attributes, a pre-mortem of the eight sessions' assumptions, and each
secure-coding checklist in `~/.claude/CLAUDE.md`. Those checklists are read over our own source:
none of their tooling is run, nothing is sent anywhere, and there is no target in the workspace to
point them at. Both findings above came out of that pass. The rest of it confirmed the decisions
recorded here:

- **The DOM takes requirement text as text.** The register, the sheet and the cascade pass it as JSX
  children, a controlled `value` or an accessible name. Neither `dangerouslySetInnerHTML` nor
  `innerHTML` appears anywhere in the feature, and `script-src` carries a per-request nonce with no
  `unsafe-inline`.
- **The client sets five fields and nothing else.** `requirementType`, `requirement`, `isMet` and the
  two id lists, plus `projectId` on create and `requirementId`/`rowVer` on update. Plain `z.object`
  drops the rest, so `Number`, `IsDeleted`, `ProjectId` on update and the audit columns cannot be
  assigned from a payload.
- **Every write resolves the project from the row, then asserts.** The helpers take the project and
  the side from the row as well, answer alike for a missing and a foreign id, and cannot be called
  from TypeScript (guardrail).
- **No statement is built at runtime.** No proc in `db/procs` uses `sp_executesql` or `EXEC(@…)` —
  `src/tests/app-login.test.ts` asserts that project-wide — the search is a parameter, and every new
  predicate has an index behind it. Sorting or searching on `Requirement` is the one uncovered path,
  which a leading-`%` LIKE makes unavoidable and the page cap of 100 bounds.
- **Concurrency is one pattern everywhere.** `app.Project WITH (UPDLOCK, HOLDLOCK)` before any other
  read, then the row's `RowVer` (or the allocation's `placeRowVer`) → 50002 CONFLICT.
  `db/tests/requirements-race.cjs` exercises four interleavings.
- **A refusal is legible and bounded.** Each failure is logged as `{action, code, reference, userId}`
  with no payload, the user gets the reference to quote, and the per-user throttle (ADR-0031) runs
  before the proc does.
- **The surface grew by one route and three actions.** No route handler, no outbound call, no new
  dependency and no credential; four superseded `usp_KeyDeliverableRequirement_*` procs were deleted
  rather than left behind.

Two things the review left alone on purpose. The new segment has no `loading.tsx` or `error.tsx`.
That is a conformance gap rather than an open question, and the review first recorded it wrongly as
one: `docs/STANDARDS.md` §1.1, §7 and §9 already require both per route segment, and the app has a
single `loading.tsx` (`projects/[id]`) and no `error.tsx` at all behind 35 pages. It is recorded as
E1 in `docs/bugs.md` with the shared `ErrorState` a boundary should use; a 35-segment sweep is its
own piece of work, not one feature's exception. And nothing in migration 036, the eleven procs, the two
`db/tests/*.cjs` suites or the Playwright specs has ever been executed: the workspace has no SQL
Server, so CI's db-apply job is their first run.
