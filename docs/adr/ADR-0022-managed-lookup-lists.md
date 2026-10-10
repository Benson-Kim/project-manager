# ADR-0022 — Managed dropdown lists (with option colours)

Status: Accepted · Date: 2026-10-09 · Session: datasheet (client feedback §2–4)

## Context

Every dropdown vocabulary was fixed in code: zod enums, CHECK constraints
(stakeholder communication preference and engagement level, Q&A category and
priority) or `app.ActivityStatus`. The client asked to manage the options
themselves, from the datasheet: "Edit Dropdown List: Contact Method" with add,
rename, delete and reorder, and changes visible at once in every row and in
the new-entry row. Later they asked to colour values (High priority, overdue)
so that rows stand out.

## Decision

- **Two tables** (migration 018):
  - `app.LookupList`: `ListKey` is the PK. `RowVer` is the whole-list
    concurrency token. `TintRows` was added in 020.
  - `app.LookupOption`: `Label NVARCHAR(50)`, `SortOrder`, `IsLocked`, `Color`
    (020), soft delete and audit columns. A filtered unique index covers
    `(ListKey, Label)` for live options.
- **18 lists**, seeded from one `@Seed` table in 018. The registry
  `LOOKUP_LISTS` (`src/lib/lookup-lists.ts`) must match the seeds, the rename
  cascade and the id-bound list. `src/tests/lookup-lists.test.ts` checks this.
- **How records store values:**
  - Records keep the label as text, as the Access data did, so values outside
    the list (e.g. "Questions I have") survive.
  - Renaming an option rewrites every record holding the old label in the same
    transaction. This is the cascade registry in `dbo.usp_LookupList_Set`, one
    line per text-bound list.
  - The one exception is `daily-activity.status`, stored by option id
    (`DailyActivity.ActivityStatusId`). 018 folded `app.ActivityStatus` into
    the list and re-pointed the FK.
- **Procs:**

  | Proc | Who | What |
  |---|---|---|
  | `usp_LookupList_GetOptions` | any active user | Options of a JSON key array, with each option's colour and the list's `TintRows`. |
  | `usp_LookupList_Set` | Admin only | Saves the whole list as JSON, in display order. Stale `RowVer` → CONFLICT. Handles rename, retire (soft delete), revive (a retired label comes back with its id), add, recolour, `@TintRows`. Writes one audit row `{tintRows, options}`. |
  | `usp_LookupList_AssertLabel`, `usp_LookupList_AssertOption` | — | Called by every Create/Update proc. A new value must be a live option. An unchanged retired value is kept. Returns the canonical spelling. |

- **Locked options** are the labels the code reads by name: key-deliverable
  status In Progress/Completed/On Hold/Cancelled, to-do status Not
  Started/Completed/Cancelled, assumption-constraint type. They can be moved
  and coloured, but not renamed or removed.
- **Admins only edit lists.** The lists are shared by every project, so a
  project Manager must not change another project's vocabulary.
- **Two entry points in the datasheet** (ADR-0023):
  - The header caret ∨ of a list-bound column.
  - "Edit list…" as the last choice of every list-bound select. Choosing it
    opens the editor and leaves the value unchanged.

  The editor renames in place, colours, moves, removes and adds options, and
  switches row colouring. A save replaces the list in `LookupListsProvider`, so
  every select re-renders at once.
- **Colours** (migration 020):
  - `Color` is a palette key: red, orange, yellow, green, blue, purple or gray,
    or NULL. It is never a raw colour value.
  - The keys map to light/dark tokens `--tone-<key>-soft/-ink` (globals.css,
    ink ≥ 4.5:1 on soft in both themes) through `src/components/ui/tones.ts`.
  - The palette is checked three times: CK_LookupOption_Color, the Set proc
    and the zod `OPTION_COLORS` enum.
  - A coloured value tints its select cell and its badge.
  - `TintRows` makes a datasheet row take its value's colour.
  - 020 seeds starting colours only for lists nobody has coloured: urgent
    priorities red/orange, statuses blue/green/yellow/gray. Priority lists
    coloured by that run also tint rows, and a re-run never turns rows back on.
- **Discriminators stay code enums**, not managed lists: to-do
  `ProjectOrActivity`, alert `RepeatUnit`, assignee titles. They drive logic,
  not wording.

## Consequences

- 018 drops the CHECKs CK_Stakeholder_{CommunicationPreference,
  EngagementLevel} and CK_QuestionAnswer_{Category,Priority}. It also drops
  `app.ActivityStatus` and its two procs, and deletes seed
  `001_activity_status.sql`.
- Adding a list means four things, kept in step by the guardrail test:
  - a `LOOKUP_LISTS` entry,
  - a seed row in a migration,
  - a cascade line (or an `ID_BOUND_LISTS` entry),
  - the Assert call in the entity's Create/Update procs.
- Overdue to-dos are a date rule, not a list value. Their red row is a
  module-level `rowTone` (ADR-0023) and wins over list colours.
