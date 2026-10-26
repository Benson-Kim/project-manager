# Client feedback on 1.0.12, 2026-10-26 — status

Everything the client marked on the "Project Manager 1.0.12: what to test" sheet, with what was
done about it. Three checks failed with a comment (M2, M6, E6), four more things were written in as
"what I noticed", and the table at the end of the sheet mixes new asks with corrections.

This branch (`feature/wbs-requirements`) closed **every correction except sub-requirements**. The
reasoning behind each decision is **ADR-0047**; this file is the inventory.

Status: **DONE** (on this branch, not yet released) · **ALREADY TRUE** (the app already did it) ·
**ASK** (needs the client before code) · **OPEN**.

> **None of this is in 1.0.12.** The client is testing a release that predates this branch. Three
> items they listed as missing are already built and simply not shipped yet — see "Already built,
> not yet released" below, which is the first thing to tell them.

## Already built, not yet released

The client asked for these in the backlog table. They landed in `bef447a` (ADR-0046, migrations
043/044) and are not in 1.0.12, so there is nothing to build — only to ship.

| Item as written | Where it is |
|---|---|
| "The gantt should be able to have dependencies. One deliverable should be dependent on another to be completed or started first." | `app.KeyDeliverableDependency`, `usp_KeyDeliverableDependency_{Link,Relink,Unlink}`, and `usp_KeyDeliverable_CascadeDependencies`, which reschedules successors |
| "Create Gantt: Finish-to-Start (FS), Start-to-Start (SS), Finish-to-Finish (FF)" | `DependencyType CHAR(2)`, one of FS/SS/FF/SF — all four, not three |
| "Milestones are major achievements or deadlines with zero duration (represented as diamonds or distinct markers)" / "For the Gantt there need to be added Milestones … This Milestone has zero duration" | `app.KeyDeliverable.IsMilestone`, with `CK_KeyDeliverable_Milestone_OneDay` holding the zero duration, drawn as a diamond |

## The failed checks

| Check | What the client wrote | Status | What was done |
|---|---|---|---|
| **M2** | "Present and Apologies need to be directly under Location" | **DONE** | They were already directly under Location on the meeting page — the screenshot is the **printed** minutes, where they sat after the objective and description. The print route now matches the workspace |
| **M6** | "The item when completed should remain but look like this: ~~strikethrough~~. But it should not continue to other meeting minutes unless the completed status is removed" | **DONE** | Two of the three parts were already true: a completed action stays in the minutes that raised it, and the carry-over list already drops it (`usp_Meeting_GetWorkspace`, `Status <> 'completed'`). The missing part was the strikethrough, which is now on the action in the minutes tree and in the printed table |
| **E6** | "It should be 1.1, 1.2 when it is indented. If indented again 1.1.1 and 1.1.2, 1.1.3 etc" | **DONE** | A sixth numbering style, `1.1`, joins 1 / a / A / i / I. Pick it on the outer list and indenting does the rest — the nested lists the editor creates inherit it. Every existing list keeps the numbering it has |

## "What I noticed"

| What the client wrote | Status | What was done |
|---|---|---|
| "I cannot add under Action Items the person responsible. It can be a drop down, but also needs to allow for a person to write the name in case it is someone not present and potentially out of the organization" | **DONE** · **ASK** | The field exists, but offered only the project's stakeholders — so a guest or an outside supplier could not be made responsible for anything, which is what "I cannot add" is about. The picker now takes a typed name as well (migration 046). **Please confirm that was the problem**, and not that the field was not visible at all |
| "The meeting minutes must have a print preview" | **ALREADY TRUE** · **ASK** | `/projects/<id>/meetings/<meetingId>/print`, linked from the meeting page as "Print view" — it is the page the M2 screenshot was taken on. M2's ordering is fixed there. **Is something else meant?** A paper-styled preview on screen, or a preview step before the print dialog? |
| "This follow up action serves no purpose and should be removed correct?" | **DONE** · **ASK** | Taken out of the meeting header form and the printed minutes. **The column and anything already typed into it are kept**, so putting the field back is a one-line revert rather than a restore. Say if it should come back |
| "Change the location of the Move page left and Move page right button. You can make it 2 arrows." | **DONE** | They were two worded buttons below the editor, away from the tabs they reorder. They are now two arrows beside the tab strip, where the screenshot drew them. They are still announced and tooltipped "Move page left" / "Move page right" |

## Requirements

| What the client wrote | Status | What was done |
|---|---|---|
| "Requirements need to be printed sometimes. They need to exported in csv etc and or pdf" | **DONE** | Both exports are in the register's toolbar. The type filter travels with them, so what downloads is what is on screen |
| "The requirements BR, SR, FR, NF, TR all should be able to create subrequirement E.g. subBR1.1, subBR1.2 then subBR1.1.1 … (as many subs as necessary)" | **OPEN** | **Not built.** Specified below. This is a tree, not a field, and it is the only correction on the sheet that was not closed |

### Sub-requirements — what it needs, for whoever picks it up

Reserved: **ADR-0048**, **migration 048**. Today a requirement is `(ProjectId, RequirementType,
Number)` and its reference is `FR-3` — flat, with the number assigned as `MAX(Number) + 1` per type.

- `app.Requirement.ParentRequirementId INT NULL`, self-referencing, with the parent in the same
  project **and** the same type.
- `Number` becomes the ordinal within the parent, not within the type, so uniqueness moves to
  `(ProjectId, RequirementType, ParentRequirementId, Number)`. Existing rows have a null parent, so
  their numbers and references do not change.
- The reference becomes the path — `FR-1`, `FR-1.1`, `FR-1.1.1` — which no column holds. The list
  proc needs a recursive CTE, because the register is paged and a child can land on a different
  page from its parent, so it cannot be assembled in the browser.
- The register's order becomes the path, which is not a sort on any column, and `"1.10"` must not
  sort before `"1.2"`.
- A parent cannot become its own descendant. That check spans rows, so it belongs under the project
  lock in the update proc, like `usp_KeyDeliverable_AssertPlacement`.
- Decisions needed from the client: what happens to children when a parent is deleted, and what a
  merge does to a parent that has them.

It was left because it is the size of the milestones-and-dependencies item, which took a session of
its own and still shipped two defects that only CI caught. A specification is worth more here than
a half-built tree.

## Corrections inside the backlog table

The sheet's last table is headed "Tell us which of these you need first, or anything missing from
the list", and mixes new modules with corrections to what already exists. The corrections were
taken.

| What the client wrote | Status | What was done |
|---|---|---|
| "Under Project-Overview change the objective field to Executive Summary and don't put a limit of 255 characters. Let a person write as much as they want" | **DONE** | Relabelled, widened to unlimited (migration 045), and it edits as a text box rather than one line — like the other narrative fields on that form |
| "Under Assumptions & Constraints remove the 'mitigation section'" | **DONE** | Out of the sheet and the write path. The column and anything already typed are kept, as with the follow-up field |
| "The Parking lot item column needs a wrap text" | **DONE** | The item cell edited as a single line while its sheet used a four-row text box. It now wraps in both |
| "The to-do list should have a column name assignee in case you need to track who is doing a certain task" (raised twice) | **DONE** | A typed name (migration 047), editable in the cell and in the sheet, and searchable — type a person's name to find their to-dos |
| "In the to do list under activity the column reorder does not work" (raised twice) | **ASK** | Does not reproduce from the code: the drag is wired and shared with every list. What *was* wrong is that a refused save was swallowed twice over, so a column would move, spring back on the next load, and say nothing. That now raises a message. **If you see "This table layout could not be saved", the cause is the save; if you see nothing at all, it is the drag — please say which page and whether you were in list or card view** |
| "You cannot have a due date before a start date" | **ALREADY TRUE** | Enforced on to-dos, projects, WBS deliverables and suppliers. Meeting action items and follow-ups have a due date but no start date to compare it with — **say if one is wanted there** |

## Not taken: the new asks

Listed so nothing is lost. None is started; none is decided.

| Item | Note |
|---|---|
| Stakeholder matrix page ("I have the fields") | Needs the client's fields. A module of its own |
| Schedule / Phase & Progress: Framework Phase (None, Initiation, Planning, Execution, Closure) and Status (None, Not Started, In Progress, On Hold…) | `app.Project` already has `ProjectPhase` and `ProjectStatus`; this is likely a managed-list change (ADR-0022) plus a form section, but the client's document of fields is needed first |
| Assumptions & Constraints: add to the validated yes/no list, colour the row and the list name; the Type column likewise | Managed lists already colour rows (ADR-0022). "Validated" is a boolean today, not a list, so it would have to become one |
| Dashboard calendar, and a granular calendar of to-dos by date and time | A module. Depends on the to-do time component below |
| "Calendar: To-Do Predication" — a to-do pushing into the calendar grid by start date and frequency | Needs the recurrence rules written down before anything is built |
| Upcoming alerts: a time component and an interval for "Due soon" | `app.TodoAlert` has `AlertTime` and a snooze; the "due soon" tier is fixed at two days (`isApproachingDeadline`). Making it per-to-do is a settings change |
| A hibernation / idle timeout the user chooses (5, 10, 20, 30 … or never) | Desktop setting plus a session decision. Its own change |
| Hide and unhide the left-hand menu | Shell change, small, not started |
| "Every single instance of a project name should be a link to the project Overview" | Not done: several of those names are editable datasheet cells, where a link competes with the click that starts an edit. Needs a decision on which wins |
| "Must write a description for the requirements deliverable I want implemented" | Read as the client offering to write a spec, not as an ask. **Confirm** |
| "User must be notified that they should take a backup of their data" | Where and when — on update, on first run, or a standing banner? |
| Captcha on the landing page | Third-party dependency and a privacy decision |
| "Under Activities in the meeting minutes section add a one to many relationship … add date field and status" | Already built in ADR-0043 (follow-ups, each with its own person, follow-up date and due date; the status is on the action). Likely written before 1.0.12 was seen — **confirm it is covered** |

Still open from the 2026-10-23 list and repeated on this sheet as "not in this release": renaming
section headers, a done button and a colour per WBS box (ADR-0039 is reserved), importing
requirements into the Kanban and several boards per project, font colour and highlight in every
long text field, right-click spelling and a spell-check switch, a whiteboard, and the financials
calculator placement and currency choice. See `docs/client-feedback-2026-10-23.md`.

## What has and has not been verified

- `tsc`, `eslint`, `prettier` and the unit suite (182 files, 9205 tests) are green here.
- `db-apply` has run migrations 045 on a real SQL Server in CI and passed. **046 and 047 are in
  flight at the time of writing.**
- **Nothing in this work has been exercised in a browser.** The new numbering style, both free-text
  assignees, the two export routes and the print ordering have no end-to-end test and no manual
  pass. They are the first things for the client to look at.
- The branch's Playwright job has **two failures that predate this work**, both in
  `e2e/key-deliverables.spec.ts` (the assignee picker at :431 and the dependency reschedule at
  :702), from the milestones-and-dependencies item. 248 of 251 pass. They are not caused by
  anything here and are not fixed here.
