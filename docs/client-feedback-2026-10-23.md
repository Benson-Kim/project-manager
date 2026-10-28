# Client feedback, 2026-10-23 — status

The sixteen to-do items the client raised, as captured from the to-do list screens. This branch
(`feature/wbs-requirements`) closed **everything that touches meeting minutes**, plus the two
wording changes that needed no new code. Everything else is listed with why it was left, so the
next session picks it up without re-reading the screenshots.

Status: **DONE** (on this branch) · **ALREADY TRUE** (the app already did it) · **OPEN**.

## Meeting minutes — all four closed

| # | Item | Status | Where |
|---|---|---|---|
| 2 | Under Activities, a one-to-many for the follow-up, assigned person and due date; add a date field and a status: On hold, In progress, Completed | **DONE** | ADR-0043 decisions 1–2, migration 040, `db/procs/meeting-action-followup/`, `src/modules/meetings/` |
| 3 | Present and Apologies moved under the Location field | **DONE** | ADR-0043 decision 5, the meeting workspace page and header form |
| 6 | In the drop-down menu change "Meetings" to "Minutes" | **DONE** | `messages.projects.meetingsSection` |
| 12 | An incomplete action carries over to the next minutes, and every later one, until marked complete | **DONE** | ADR-0043 decisions 3–4, `usp_Meeting_GetWorkspace`, `usp_MeetingActionItem_SetStatus` |

What #2 and #12 became, in one line each:

- An action item now has **one** status — on hold, in progress or completed — which is what marks
  it done, and **many** follow-ups beneath it, each with its own person assigned, follow-up date
  and due date.
- A meeting shows **Carried over from earlier meetings**: every unfinished action of the project's
  earlier meetings. It is read-only apart from its status, links to the meeting that raised it, and
  completing it there clears it from every meeting at once, because it is one row read in many
  places rather than a row copied into each.

## Quick wins taken

| # | Item | Status | Where |
|---|---|---|---|
| 16 | Under Overview, change "Problem statement" to "Opportunity/Problem statement" | **DONE** | `messages.projects.problemStatement`; the form field name and the `ProblemStatement` column are unchanged, so no migration and no data move |
| 8 | Right-click spell check | **ALREADY TRUE** | `spellCheck` is on every prose `Input` and `Textarea` (`src/components/ui/form/inputs.tsx`) and on the rich-text surface (`editor-surface.tsx:84`); the browser's own menu does the rest. Nothing to build. **Wrong for the desktop app**, which had no right-click menu: corrected 2026-10-28 by ADR-0049 |

## Still open, and why they are not quick

| # | Item | Why it was left |
|---|---|---|
| 1 | Section headers customizable (Critical) | Needs a per-project store for the names and a decision on who may rename a section; it touches every module's page, not one. Its own ADR |
| 4 | A button on each WBS item to mark it already done | The WBS already has a status menu (ADR-0036, `usp_KeyDeliverable_SetStatus`); this is a question about what "done" adds to it, which needs the client's answer before code |
| 5 | Import requirement descriptions into the Kanban; many Kanbans per project | The board module is `feature/boards`, not this branch. Belongs with slice B5 (`usp_BoardCard_Package`) |
| 7 | Font colour and highlight everywhere in the system | Rich-text feature across every editor; its own slice |
| 9 | Enable or disable auto-correct | Needs a user setting and a place to keep it; `autocorrect` is also not uniformly honoured by browsers, so the client should see a prototype first |
| 10 | Create a whiteboard | A module of its own |
| 11 | A calculator in the financials left-hand menu | ADR-0029 already built a financials calculator; this asks for a different placement, so it needs the client to point at what they mean |
| 13 | Navigation arrows (`<` `>`) above Daily Activities and the to-do list to scroll horizontally | **DONE**, as a scrollbar rather than arrows — see the follow-up below |
| 14 | Each WBS deliverable box able to take a different colour | **ADR-0039 is reserved for this** (WBS/Gantt colour mode); it is its own PR by prior decision |
| 15 | Choose a currency for financials, or no symbol at all | Financials module; needs a per-project or per-financial setting and a rounding/format decision |

## Follow-up asks of the same day — all three closed

Raised after the four above landed, and recorded in **ADR-0044** (migration 041).

| Item | Status | Where |
|---|---|---|
| For the on-hold status, we can supply a reason | **DONE** | ADR-0044 decisions 1–3, migration 041, the three `meeting-action-item` write procs, `usp_Meeting_GetWorkspace`, `ActionStatusCell` + `OnHoldReasonDialog` |
| Each table column gets an up/down triangle to order ascending or descending | **DONE** | ADR-0044 decision 4, `ListSort` in `src/lib/list-params.ts`, one constant per module, `DataView sort=` |
| All columns stick on vertical scroll, so you know which column you are in | **DONE** (hardened; it already stuck) | ADR-0044 decision 5 — the stickiness moved from the `<thead>` to the cells, which is what keeps their borders |
| A sticky horizontal scroller, so you need not scroll to the bottom to find one | **DONE** | ADR-0044 decision 5, `src/components/ui/data-view/sticky-scrollbar.tsx` |

Three things worth knowing about what that became:

- **A reason belongs to the hold.** Only an action whose status is on hold carries one; moving it on
  clears it, so nobody reads "why it is waiting" next to "it is done". The audit row keeps every
  reason a hold ever had, so nothing is lost. Picking "On hold" asks for the reason first and writes
  both together — the reason is never left to a second save that may not happen. It is optional.
- **A column shows a triangle only if its stored procedure can actually apply that order.** An
  unknown `@SortBy` is ignored by the procs rather than refused, so an arrow on the wrong column
  would promise an order the server never applied. Each module declares the columns its proc
  honours, and a guardrail test reads the proc's own `ORDER BY` and fails the build if the two
  drift. Objectives has no triangles because its proc orders by its id alone.
- **Daily activities now really does lead with the most recent request.** Both of its pages
  documented that order and asked for it with `listParams.dir ?? "desc"`, which the list schema's own
  `"asc"` default made dead code. The default direction is part of the module's sort constant now.

One thing is deliberately not fixed, and needs its own decision: the table scrolls inside its own
box (an `overflow-x` scroller captures vertical stickiness too) while the page also scrolls, so
scrolling the page far enough can slide that box — and the header stuck to it — under the app
header. Making the page one scroller is a layout change for its own ADR, and nothing
browser-shaped runs in this workspace to measure it with.

## Follow-up asks, 2026-10-24 — four WBS/Gantt items

Recorded in **ADR-0046**; the implementation plan, split by concern, is
`.agent-scratch/plan-wbs-milestones-dependencies.md`.

| Item | Status | Where |
|---|---|---|
| Each deliverable takes 0 to many assignees | **ALREADY TRUE**, with three gaps closed | Migration 015 made assignees a junction table and the form already sent none as "clear them all". ADR-0046 decision 3: an **Assignees…** command on the WBS item menu opens the details on the picker, a diagram box names its assignees (in its text and in its spoken label), and `db/tests/key-deliverable-assignees.cjs` pins none/one/many, clearing, a repeated id and a foreign-project id being dropped |
| Requirements moves in the project section nav | **DONE** | ADR-0046 decisions 1–2: it is its own group before Planning, and a group of one section is a pill link rather than a disclosure that opens nothing |
| The breakdown has milestones | **DONE** | ADR-0046 decision 4, migration 043: a milestone is a one-day leaf on `app.KeyDeliverable` (`IsMilestone`), added from the toolbar or converted either way from the item menu — which names the span it drops first. It is drawn as a diamond, moves but never stretches, takes no sub-items, and the details sheet shows it one **Milestone date** field. `db/tests/key-deliverable-milestone.cjs` pins the rules the CHECK and the project lock enforce |
| Dependencies between items: FS, SS, FF, SF | **DONE**, the client chose auto-scheduling | ADR-0046 decisions 5–10, migration 044. `app.KeyDeliverableDependency` holds one typed, lagged link per ordered pair, both ends in one project by composite foreign key, with no self-link and no cycle or ancestor pair. Asked on 2026-10-24 whether a link should be drawn and warned about or **reschedule like MS Project**, the client chose rescheduling: a violated link pushes its successor to the earliest day it allows, and the push cascades down the chain. It only ever pushes **later**, never earlier — so the schedule never contracts behind anyone's back, the loop always settles, and the requested-date floor cannot be broken by it. A drag says how many later items it will carry before it commits. Links are drawn as arrows and reached by keyboard through **Dependencies…**; `db/tests/key-deliverable-dependency.cjs` pins every rule and each type's boundary |

## What ran, and what did not

Verified locally on this branch, after merging `develop` in: `tsc --noEmit` clean (app and
`electron/`) · **170 files, 8,453 tests, 0 failures** · 90.58 % statements, 91.45 % lines against an
80 % gate (measured before the merge) · `eslint` 0 errors (5 pre-existing warnings, none in changed
files) · `prettier --check` clean on every changed file · `next build` succeeds.

`develop` gained the notes module (ADR-0035) while this branch was open. One conflict, in
`messages.ts`: this branch renamed the drop-down's "Meetings" to "Minutes" (item 6) where notes added
its own section entry — both kept. The notes list also arrived without a sort contract, which is what
the new guardrail is for, so it was given one (`NOTE_SORT`: Title, TabCount, LastEditedAtUtc).

**Not verified, because nothing database- or browser-shaped runs in this workspace:** migrations 040
and 041 have never been applied, the five new stored procedures and the five changed ones have never
been created on a server, and no Playwright spec in this change has run. There is no
`db/tests/meetings-*.cjs` behaviour script, so the new 50004 refusal (a reason without a hold) is
asserted against the proc text, not against a server; `db-apply` is what proves the migration
applies, re-applies and that every proc creates. The commits are tagged `[db]` and `[e2e]` so CI does
both.
