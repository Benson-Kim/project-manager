# ADR-0060: Configurable requirement links, link records and test-based coverage

- Status: Accepted. The choices marked "default" are ours, not the client's, and can be changed.
  Amends ADR-0037 (decision 3 and the 2026-11-05 amendment) and ADR-0048 (the delete choice).
- Date: 2026-11-06
- Module: requirements (#10)

## Context

ADR-0037 ships a fixed ladder: BR/SR are validated by FR/NFR/TR, and those by TC. Each link runs
exactly one side up, a link is a bare pair of ids, and "covered" reads the met tick of what
validates a row. The client's pre-build answers replace all of that:

| Question | Answer |
|---|---|
| Chain | WBS, BR, SR, FR/NFR, TR, Test. Everything links to a WBS |
| More than one parent | Yes |
| Skip levels | Yes, and it counts as coverage |
| Backwards links | Yes. Settings hold the rules, upward and downward |
| Same-type links | Allowed |
| Test cases | A normal requirement, anywhere except WBS level 1 |
| Deleting a parent | Block with a warning, then ask: delete the children or orphan them |
| A link has its own life | Author, date, rationale, status |
| Covered | Tests passing in the latest run |
| Inheritance | Covered automatically from children |
| Tests required | Leaf-level types |
| Gaps | Informational only |
| Upstream change | Nothing happens downstream |
| Versioning | A user setting: versioned links point to a version, others to the latest |
| Approved lock, baselines | Not needed |
| Permissions, ids, cross-project | The app's existing rules |
| Gantt and WBS | Independent of the canvas |

The canvas that sits on these links has its own ADR.

## Decision

### 1. What a link is

**A link says the downstream item traces to the upstream item, so it counts towards the upstream
item's coverage.** It is a coverage relationship, never a loose "related to". There is one kind of
link, so the canvas and the register cannot draw two meanings the same way.

### 2. Which way is upstream

Upstream is towards the WBS, downstream is towards the test. The order is WBS, BR, SR, FR/NFR, TR,
TC. The brief settles it: question 3 calls an FR linking to a WBS item "upward", question 10 speaks
of an upstream requirement changing and the effect downstream, and the photo's "Downstream" heading
sits over the chain from WBS to Test. The register already means this. The pyramid drawing in the
photo could be read the other way; it is not treated as a rule (default).

### 3. Rules are data, and the server enforces them

`app.RequirementLinkRule (DownstreamType, UpstreamType, CreatedAtUtc, CreatedBy)`, primary key on
the pair. A row means "this type may sit downstream of that type".

- `DownstreamType` is one of the six requirement types. `UpstreamType` is one of the six or `WBS`.
- An ordered pair says everything: ticking both (FR, BR) and (BR, FR) is the "backwards" case, so
  there is no direction column. Any allowed link can be made from either end.
- Seeded to the client's chain: every pair whose downstream type is at or below its upstream type,
  which gives skip levels and same-type links. Backwards pairs start unticked.
- **App-wide, edited by an Admin in Settings > Administration** (default). A traceability scheme is
  the client's method, not one project's choice, and the app has one client. A project override
  later is one column and one lookup, so nothing here blocks it.
- Enforced in `usp_Requirement_ReplaceTraces`, the new link procs, `usp_Requirement_ReplaceAllocations`
  and the resulting-state check in `usp_Requirement_Update`. Non-negotiable: a rule shown in Settings
  is a rule the server applies. `upstreamTypes`, `SIDES`-based linking and `compatibleTypes` stop
  deciding; the UI reads the rules to offer choices, and the proc has the last word.
- **Removing a rule leaves existing links alone.** It applies to new links only, the same way an
  upstream change does nothing downstream. A type change is checked against the rules for every link
  the row has.
- A test case on a level 1 WBS item is refused by a fixed check, not a rule: it is the client's
  stated exception, and level means `ParentKeyDeliverableId IS NULL`.

### 4. Links cannot form a loop (default)

The client wants anything linkable, and the rules allow it at type level. At item level a link that
would close a loop is refused: "FR-1 is covered by BR-1 and BR-1 by FR-1" has no meaning, and
inherited coverage needs an end. The check walks downstream from the upstream item under the project
lock that every structure write already takes. Same-type links go through the same check.

### 5. A link is a record

`app.RequirementTrace` and `app.RequirementDeliverable` stay, and stay separate: the second carries
order and its own concurrency, which the WBS and Gantt cascade rely on. Both gain the same fields.

| Field | Meaning |
|---|---|
| `Rationale NVARCHAR(1000) NULL` | Why the link exists |
| `LinkStatus VARCHAR(10) NOT NULL` | `Proposed`, `Active` (default) or `Retired` |
| `UpdatedAtUtc`, `UpdatedBy` | Last change. Author and date are the existing `CreatedBy`, `CreatedAtUtc` |
| `RowVer` | On the trace table, which has none. A stale write answers 409 |

- `RequirementDeliverable`'s "solutions only" rule goes: a rule row now decides, so every type can
  link to a WBS item. The cascade keeps its own order and shows what is linked.
- **Only `Active` counts** towards coverage. `Proposed` shows as a draft and `Retired` stays on
  record out of the chips. The values are a fixed set because coverage depends on them, unlike the
  managed lists of ADR-0054 (default).
- `ReplaceTraces` keeps diffing, so a sheet save never wipes the rationale of a link it keeps.
- New procs, one job each: `usp_RequirementLink_Create`, `_Update`, `_Delete`, under
  `requirements:update` at Contributor, audited as `LinkCreate`, `LinkUpdate`, `LinkDelete`. The
  rule procs are Admin only and audited.
- `usp_RequirementLink_List` reads every link of one requirement with its record for the sheet, at
  Viewer. The register's chips keep reading `ufn_Requirement_Links`, so rationale stays out of the
  paged list.
- A link edit counts as an edit of the requirement, so `_Create` and `_Delete` are `requirements:update`
  rather than verbs of their own, and removing a link stays Contributor.

### 6. Test runs

`app.RequirementTestRun (TestRunId, ProjectId, RequirementId, Result, RunAtUtc, RunBy, Notes)`.

- `Result` is `Passed`, `Failed` or `Blocked`. Rows are append-only: a run is a fact, and the next
  run is a new row. Only a `TC` row can take a run (composite FK plus a check in the proc).
- **"Latest run" is per test** (default): the newest row for that test. A project-wide run would mark
  every test left out of it as failing, which is not what the client's answer asks for. A run may
  carry an iteration label in `Notes`; "multiple iterations" in the photos does not need a table.
- **`IsMet` stays, as the latest result.** For a `TC`, `IsMet = 1` means its newest run passed, set
  only by `usp_Requirement_RecordTestRun` in one transaction. Ticking a test in the UI records a run
  (Passed, or Failed when cleared), so the tick, the list columns and the export keep working.
- The met tick on FR/NFR/TR stays for the WBS cascade and stops driving coverage.

### 7. Coverage

Derived, never stored. Only tests prove anything, and the walk has one definition:

> The downstream set of an item is everything reachable through its `Active` links and its live
> sub-requirements. Its leaves are the rows in that set with nothing below them. A leaf is covered
> only if it is a test case whose latest run passed. A leaf that is not a test case is a gap.

- A row reads "Not covered" with no leaves or none passing, "m of n covered" with some, and
  "Covered" with all. A skipped level counts because only reachability matters.
- A test case reads its latest result. A leaf requirement with no test reads "Needs a test".
- "Leaf-level types" means leaf by position, not a fixed list of types (default): with free linking
  any type can be the last one above a test.
- **Gaps are informational.** A chip and a filter, and nothing is ever blocked by one.
- Worked out in SQL for the project, walking with de-duplication so a diamond is one leaf, and joined
  to the page. The register stays paged in the database and no link list reaches the browser. The
  query plan is shown when this is built.
- A WBS item shows no coverage figure of its own: Gantt and WBS stay independent.

### 8. Deleting a parent

A requirement counts as a parent if it has sub-requirements or anything linked downstream.
`usp_Requirement_Delete` refuses that row unless told what to do, and `@PromoteChildren` becomes
`@ChildAction` (`None`, `Orphan` or `Delete`).

- `usp_Requirement_DeleteImpact` lists what would happen, and the dialog states it before asking.
- **Orphan**: links go, sub-requirements move up a level as they do today.
- **Delete**: the sub-requirement tree goes, and each downstream row goes **only if this parent was
  its last upstream link**, repeated down the chain (default). A row that also serves another parent
  just loses this link: FR-5 under BR-1 and BR-2 must survive deleting BR-1.
- Soft delete, audited with `BeforeJson` for every row, in one transaction under the project lock.

Built as `ufn_Requirement_DeleteSet`, the one definition of what the delete removes, read by both `usp_Requirement_DeleteImpact` and `usp_Requirement_Delete`. It grows to a fixed point, because a doomed row brings its own sub-tree and that sub-tree can leave further rows with nothing upstream.

- A sub-requirement of a doomed row always goes. It cannot stay under a deleted parent.
- A top-level row goes only when every upstream link it has is to a doomed row and no WBS item holds it. A link of any status counts, Retired included, and a WBS allocation counts as an upstream link. Both choices delete less.
- A sub-requirement under a surviving parent stays and only loses the link.
- The dialog sends the row count it showed as `@ExpectedDeleteCount`. A different or missing count is a CONFLICT, so nothing goes unseen. It is a count, not a list of ids: a change that swaps one row for another under the same count is not caught.
- "Keep them and remove the links" is the preselected choice.

### 9. Links show everywhere

There is one store, so every view reads the same rows: register chips up and down, the sheet, the
WBS and Gantt cascade, the board card panel, the canvas. Linking never moves a date or a progress
figure. A link can be made from either end, and the sheet gets an upstream and a downstream picker.

### 10. Left out on purpose

- **Versioning is not built** (default, and for the client to confirm). Links point to the latest,
  which is the client's own "not versioned" branch. The setting is not shown, because a stored
  setting nothing enforces is a defect. Adding it later is additive: a version table and a nullable
  version column on the two link tables.
- No suspect-link flag, approved lock or baselines, per the client's answers.
- "Warn items that…" in the photos is cut off. It is read as the duplicate warning on creating from
  the canvas (default), and the canvas ADR carries it.

## Consequences

- The two checks that hard-code the ladder in SQL go, and one table replaces them. Rule changes need
  no migration.
- `requirement-types.ts` keeps sides only for what truly depends on a side: the met tick and catalog
  order. Coverage, merge targets and pickers stop assuming a ladder.
- The Coverage column's wording changes to Covered, m of n covered, Not covered, Needs a test.
  Existing need and solution chips keep working; the guardrail and the coverage tests are rewritten.
- Coverage now depends on recorded runs. A project with no test cases reads "Needs a test" on every
  leaf. That is informational and is the point of the client's answer.
- Migrations: 063 (rules, link records), 064 (test runs, with a Passed run backfilled for any `TC`
  already ticked). Both only add, so an older app build keeps running against them.

## Build slices

| Slice | Scope |
|---|---|
| 5a | Migration 063, rule procs, rules enforced in the write procs, loop check, TS rule model |
| 5b | Link record procs, repository, actions, sheet pickers and link fields |
| 5c | Settings matrix |
| 5d | Delete impact and the delete-or-orphan dialog |
| 5e | Show everywhere: chips, cascade, card panel, any WBS type, level 1 test refusal |
| 6a | Migration 065, run procs, tick records a run, coverage function |
| 6b | Run history in the sheet, Coverage column, gap filter |
