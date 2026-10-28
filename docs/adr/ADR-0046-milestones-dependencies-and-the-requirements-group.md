# ADR-0046 — Milestones, task dependencies, assignee cardinality, and the requirements nav group

Status: **Accepted** · Date: 2026-10-24 · Session: wbs-requirements
Amends [ADR-0018](ADR-0018-project-workspace-nested-layout-and-section-nav.md) §3 (segment order)
and [ADR-0019](ADR-0019-project-section-nav-grouped-disclosure.md) (what a group of one renders as);
amends [ADR-0027](ADR-0027-wbs-gantt.md) §2 (decision 4 adds a one-day item to the breakdown) and
§9 ("no dependency arrows") when decision 5 lands.

The implementation plan for all five decisions, split by concern with its files, is
`.agent-scratch/plan-wbs-milestones-dependencies.md`.

## Context

Four client asks of 2026-10-23/24, all in the WBS/Gantt (module #9): a deliverable takes 0 to many
assignees; the breakdown has milestones; items depend on each other as finish-to-start,
start-to-start, finish-to-finish or start-to-finish; and requirements moves in the project section
nav, "because it has several items already".

Two things were already true and shaped the rest. Assignees have been a junction table since
migration 015 (`app.KeyDeliverableAssignee`), with the form sending an empty set as `NULL` and the
update proc reading that as "clear every assignee" — so the first ask needed no data change, only a
way to reach the field from the editor. And the requirements register has been a project-level
catalogue since ADR-0037 (five types, per-project reference numbers, traces, allocation to any
number of deliverables), which is what makes it a peer of Planning rather than an entry inside it.

## Decision

### 1. Requirements is its own nav group, before Planning

`projectSectionGroups` gains a `requirements` group holding the register, and Planning loses that
entry. The group sits between Overview and Planning, and `requirements` moves to the same place in
the flat `projectSections` registry, so the documented segment order (ADR-0018 §3) and the order
people see are the same list: charter · **requirements** · objectives · deliverables · stakeholders
· suppliers · activities · todos · keywords.

The reading order is the direction the data flows: the register states what must be true, and the
deliverables under Planning are what satisfy it (ADR-0037). No route changes, so nothing
deep-linked moves.

### 2. A nav group with one section is a pill link, not a disclosure

ADR-0019's grouped disclosure special-cased the Overview group — one section, the charter index —
as a plain link, keyed on its segment being `"."`. The rule is not about the charter: a disclosure
holding a single link opens a panel to repeat what the pill already says, and
`ProjectSectionNav` skipped rendering a panel for any group of one, so a second such group would
have been a button that opens nothing. The condition is now the section count, which is what the
e2e assertion already said it was.

### 3. A deliverable takes 0 to many assignees, reachable from the editor

Confirmed as the contract, not re-implemented: none is a normal number of assignees at every layer
(junction table, `@AssigneeIds` JSON, the optional form field, `parseAssigneesJson`). Three gaps
closed:

- **The WBS/Gantt editor reaches the field.** An **Assignees…** command on the item context menu
  opens the item's details on the picker, with the caret in it. `MultiSelect` takes an optional
  initial focus for this, applied a frame after mount because the sheet focuses its first field as
  it opens.
- **A diagram box names its assignees**, as a Gantt row already did beside its bar. The box's
  `aria-label` carries them too: it replaces the box's text for a screen reader, so visible names
  left out of it would be invisible to one.
- **A stakeholder of another project is dropped, not refused.** Both write procs already filtered
  such an id; that stays — it leaks nothing and keeps a repeated save idempotent — and
  `db/tests/key-deliverable-assignees.cjs` pins it, along with none/one/many, clearing the set, and
  a repeated id landing once, so the asymmetry with other procs is a decision rather than an
  accident.

### 4. Milestones (Accepted — migration 043)

A milestone is a date in the breakdown, not a span: the same `app.KeyDeliverable` row with
`IsMilestone = 1`, keeping its code, status colour, requirements and assignees. It spans one day
(`StartDate = Deadline`, a **table-level** CHECK), it is a leaf (`AssertPlacement` refuses a child
under one), the rollup is unchanged because a leaf is all it is, and it converts either way from the
context menu with the consequence named before it runs. Dragging moves it; stretching is refused.

Four things the plan did not name, settled while building it:

- **Every path that writes dates holds the one day, so the CHECK is a backstop and not an error
  message.** `Create` refuses a milestone sent with a span rather than reinterpreting the caller's
  dates; `Reschedule` refuses a stretch the way it already refuses a parent's; `SetMilestone`
  collapses the span on the way in. Each is `VALIDATION` 50004, so the editor can show it.
- **`Update` derives a milestone's end from its start** instead of taking one. The details sheet is
  a second surface for these dates, and two fields that must stay equal is a trap; the row owns the
  rule, and the sheet shows one **Milestone date** field (the same shape as a parent's read-only
  rolled-up dates). The requested-date rule of ADR-0027 is re-checked against the derived day.
- **The flag changes only through `usp_KeyDeliverable_SetMilestone`.** `Update` takes no
  `@IsMilestone` parameter at all, so no details-sheet save — forged or honest — can convert an
  item; `wbs-sql-guardrails.test.ts` asserts on the proc's parameter list, not just its body.
- **Asking for the state an item already has writes nothing** (no row touched, no audit row), so a
  double click or a replayed queue entry is idempotent rather than a `CONFLICT`.

The leaf half of the invariant spans rows, so no CHECK can hold it: `AssertPlacement` (create and
move) and `SetMilestone` both take it **after** the `app.Project` `UPDLOCK, HOLDLOCK`, so a sub-item
cannot be inserted in the gap between the check and the write.

### 5. Dependencies (Accepted — migration 044)

`app.KeyDeliverableDependency` records one link per ordered pair, typed `FS`/`SS`/`FF`/`SF` with a
bounded lag in days, both ends scoped to the link's project by composite foreign key, no self-link,
and no cycle or ancestor pair — the last two checked in the write procs under the `app.Project` lock
that ADR-0027 §4 already requires of every structural write. `usp_KeyDeliverable_GanttData` returns
each row's predecessors and folds the link table into its freshness stamp.

### 6. A dependency schedules: a violated link pushes its successor

**The client chose MS-Project behaviour on 2026-10-24**, over the drawn-and-warned alternative this
ADR proposed. A link that is violated moves its successor to the earliest day that satisfies it, and
that move cascades to the successor's own successors.

The four types, with a lag in days, over spans whose both ends are inclusive days:

| Type | The successor may not | Earliest it may take |
|---|---|---|
| `FS` | start until the predecessor has finished | `predecessor.end + 1 + lag` |
| `SS` | start before the predecessor starts | `predecessor.start + lag` |
| `FF` | finish before the predecessor finishes | `predecessor.end + lag` |
| `SF` | finish before the predecessor starts | `predecessor.start + lag` |

Only `FS` carries the `+ 1`, because only `FS` means "after the end"; the ends are inclusive, so a
successor that started on its predecessor's last day would overlap it. At lag 0 that is the whole
difference between `FS` and `SS`, which is why the boundary is a test vector rather than a comment.

### 7. The cascade only ever pushes later, never pulls earlier

A successor is moved forward to satisfy a link and is never moved back to close a gap. Three things
follow, and they are the reason for the rule rather than consequences of it:

- **It terminates.** Every round strictly increases at least one date, the graph has no cycle
  (decision 5) and the links are finite, so the fixpoint is reached in at most as many rounds as the
  longest chain. The proc still carries a round cap and refuses rather than spinning.
- **It cannot break the requested-date floor.** `Deadline >= RequestedDate` is a floor, and pushing
  an end later can only satisfy it further, so auto-scheduling adds no new refusal and no new THROW
  code. Pulling earlier would have fought that rule on every drag.
- **Slack is never reclaimed silently.** Move a predecessor earlier and its successors stay where
  they are; the person drags them, or deletes the link. The schedule never contracts behind
  someone's back.

### 8. A cascaded row is derived state, not an edited one

Only the row the person touched carries a `RowVer` and gets a `CONFLICT` on a stale write. The rows
the cascade moves carry none: they are recomputed under the `app.Project` `UPDLOCK, HOLDLOCK` that
ADR-0027 decision 4 already requires of every structural write, which is exactly how
`usp_KeyDeliverable_RollUp` has always rewritten parent dates and how a parent's drag has always
shifted its whole branch. The lock serializes the project's structural writes, so there is no lost
update to protect against with a version — there is one well-defined order.

This is a deliberate reading of the concurrency rule, not an exemption from it: a version guards
state a person edits, and a cascaded date is state the schedule derives.

### 9. The move names its consequence before it commits

Dragging one bar can move bars the person never touched, which is the disruptive-action case in
STANDARDS safety: the editor previews the cascade while the bar is still in hand ("3 later items
will move") and announces what moved once the server answers. The preview is the same pure function
the proc mirrors, so what is promised is what happens. The move is reversible by dragging back, so
it warns rather than asking permission on every drag.

### 10. One scheduler, called by every proc that can move a date later

`usp_KeyDeliverable_CascadeDependencies` owns the fixpoint: roll parents up, find the violated
links, push each successor's branch, repeat. `usp_KeyDeliverable_RollUp` gains `@Audit BIT = 1` so
the loop can converge quietly and the scheduler audits each moved row exactly once, with its net
before and after rather than one row per round.

`Reschedule`, `Update`, `Create` and `Move` call it, and so do the link procs, because a new or
retyped link can be violated the moment it is made. `Delete` and `SetMilestone` do not: a delete and
a conversion to a milestone only ever shorten a span, and nothing is pushed by an end that moves
earlier.

## Consequences

- The nav has six groups. Two of them (Overview, Requirements) are pill links; the other four are
  disclosures. A third group of one would need no code.
- Nothing in the assignee contract changed, so no migration and no proc change landed with decision
  3 — only the editor, the shared picker and the tests.
- ADR-0027 §9 keeps "no critical path, no time of day". Decisions 5–10 remove only its dependency
  sentence.
- The composite foreign keys needed no fallback: `UX_KeyDeliverable_Id_Project` has existed since
  migration 036, which added it for `app.RequirementDeliverable`'s own composite keys. Both ends of
  a link are therefore **strong** invariants, not the proc-level checks the plan had budgeted for,
  and no demotion is recorded. An item with no project cannot take a link at all, because the link's
  `ProjectId` is `NOT NULL` and could never match a null one — which is the behaviour we want.
- Auto-scheduling makes dates have two writers, the person and the scheduler. The scheduler only
  ever pushes later (decision 7), so the two cannot disagree about a floor: `RollUp` derives a
  parent from its children, the cascade pushes children, and the parent follows on the next round.
- A drag can now be partly undone by the server: pulling a bar earlier than a predecessor allows
  pushes it back to the earliest day the link permits. That is the rule working, not a failure, and
  the editor shows the corrected dates the proc returns.
- A milestone is drawn as a diamond: on the Gantt (one day wide, still a 40 px target per
  STANDARDS §5.3) and beside the item's number in the WBS diagram. It reads as "Milestone,
  12 Nov 2026" rather than a range, and its length is not a field to type in.
- Nothing database- or browser-shaped runs in this workspace, so migration 043, the new proc and
  the new Playwright test have never executed here: `db/tests/key-deliverable-milestone.cjs` and CI
  (`db-apply`, `[db]`/`[e2e]`) are the verifier.
- ADR-0039 stays reserved for the WBS/Gantt colour mode; 0041/0042 are `feature/rich-text-formatting`'s.
- This ADR was drafted as 0045 and renumbered to 0046 on 2026-10-24, when `develop` was merged in
  carrying [ADR-0045](ADR-0045-read-committed-snapshot.md) and migration 042. Milestones therefore
  take migration 043 and dependencies 044 — the same yielding as `a39e17d` did for the meetings work.
