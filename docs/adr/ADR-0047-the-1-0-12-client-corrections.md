# ADR-0047 — The corrections the client marked on the 1.0.12 test sheet

- **Status:** Accepted
- **Date:** 2026-10-26
- **Supersedes:** nothing. Extends ADR-0037 (the requirement register), ADR-0043/ADR-0044 (meeting
  action items), ADR-0023 (the datasheet) and ADR-0041 (rich text).
- **Migrations:** 045_project_executive_summary.sql, 046_meeting_action_assignee_other.sql,
  047_todo_item_assignee.sql

## Context

The client tested desktop release 1.0.12 against the "what to test" sheet and returned it marked
up. Three checks failed with a comment (M2, M6, E6), four more things were written in as "what I
noticed", and a long table at the end mixes new asks with corrections to what is already built.

This ADR covers the **corrections** — the places where something shipped and is wrong, or shipped
and is not what was asked for. The net-new asks in that table are inventoried in
`docs/client-feedback-2026-10-26.md` and are not decided here.

Two things are worth stating before the decisions, because they shaped them:

- **Three of the client's "missing" items are already built and unreleased.** Gantt dependencies
  with FS/SS/FF/SF, and zero-duration milestones drawn as diamonds, landed in `bef447a` on this
  branch (ADR-0046, migrations 043/044). The client is testing 1.0.12; that work is not in it.
  Nothing was decided or built for those three here.
- **Two of the comments are questions, not instructions.** The client asked whether the meeting
  header's "Follow-up action" field "serves no purpose and should be removed correct?", and wrote
  "I cannot add under Action Items the person responsible" about a field that exists. Both were
  acted on, and both are flagged in the feedback document for the client to confirm.

## Decisions

### 1. The project overview's Objective becomes the Executive Summary, uncapped

`app.Project.Mandate NVARCHAR(255) -> NVARCHAR(MAX)` (migration 045), the label in
`messages.projects.mandate` becomes "Executive summary", and the field becomes a textarea.

The column keeps its name. Renaming `Mandate` to `ExecutiveSummary` would move data, touch five
procs, the seed, the audit snapshots and every `SELECT` list, to change a word the user reads — and
the word the user reads lives in `messages.ts`, which is the point of `messages.ts`. The label and
the column are allowed to disagree; they already do elsewhere (`ProblemStatement` is labelled
"Opportunity/Problem statement", ADR-0023's client pass).

255 characters is under two sentences, and the field's siblings on the same form
(`ProblemStatement`, `CurrentState`, `FutureState`, `UserImpact`) have been `NVARCHAR(MAX)` since
migration 003. This makes one form's narrative fields agree rather than introducing a new shape.

Widening a NULLable column with no index, constraint or computed column over it is a metadata-only
change, so the apply is instant whatever the row count — which is why this is safe to bundle with
the rest rather than scheduling it.

### 2. An action's person responsible may be someone who is not a stakeholder

`app.MeetingActionItem.AssigneeOther NVARCHAR(255) NULL` beside the existing foreign key
(migration 046), with `CK_MeetingActionItem_OneAssignee CHECK (AssignedToStakeholderId IS NULL OR
AssigneeOther IS NULL)`.

The client asked for the drop-down to "allow for a person to write the name in case it is someone
not present and potentially out of the organization".

**A typed name does not get a Stakeholder row invented for it.** A stakeholder is a relationship to
a project — it carries an engagement level, a communication preference, an attendance history and
its own access semantics. Creating one so that a free-text label has somewhere to live would put
rows in the stakeholder register that nobody chose to put there, and they would then appear in
every stakeholder picker in the product.

**The constraint is the point, not decoration.** "Responsible" is one person. A row carrying both a
stakeholder and a typed name has no answer to "who?", and the reads resolve the name with
`COALESCE(stakeholder, AssigneeOther)`, which would silently prefer the stakeholder and hide the
typed name — a value stored, shown nowhere, and surviving every later edit. Both write procs refuse
the pair as a `VALIDATION` first, so the user reads a sentence rather than a constraint violation;
the CHECK is what holds when something other than the form writes.

**Reading it back is inference, not a third column.** A stored name with no stakeholder id behind
it is free text. The form needs no extra field to know which box to fill.

**The picker's half is a Combobox capability, not a meetings one.** The person-responsible field is
already the shared combobox, so "text that matches no option is submitted under a second field
name" was added there. Its two hidden inputs are exclusive — a pick clears the typed name, a typed
name clears the pick — so the form cannot post the pair the database forbids. The next "pick one,
or type a name" field in any module gets it without new code.

### 3. A to-do records who is doing it — as free text, unlike decision 2

`app.TodoItem.Assignee NVARCHAR(255) NULL` (migration 047).

This is deliberately the opposite choice to decision 2, made one migration later, so the reason
needs writing down: **a to-do need not have a project.** A personal to-do has no `ProjectId` — it
may hang off a `DailyActivity` instead (migration 014) — so there is no project to resolve a
stakeholder against, no `usp_Project_AssertAccess` that would mean anything for the id, and no
picker that could be populated. A foreign key whose target cannot be scoped is worse than text.

`app.QuestionAnswer.AssignedTo` is the same shape and predates both.

The column joins `usp_TodoItem_List`'s search columns, so a person's to-dos can be found by typing
their name. That is the escaped leading-wildcard `LIKE` of the ADR-0016 contract, covered by the
project-wide escape guardrail; it cannot seek an index, but neither could any other search column,
and the page is capped.

### 4. Legal numbering is a style, carried by an attribute rather than a style

The rich-text numbering menu gains `1.1`, which renders nested items as 1.1, then 1.1.1.

It is the one numbering style no `list-style-type` can express, so it does not travel as an inline
style like the other five: the `<ol>` carries `data-numbering="legal"` and CSS `counters()` draws
the chain. Nested lists inherit it through a descendant selector, so indenting is the whole
gesture — the inner list needs no attribute of its own, which matters because the editor creates
those nested lists itself when the user presses Tab.

**The sanitiser builds the attribute from the numbering type rather than passing one through.**
Markup arriving with a `data-numbering` of its own is dropped. This keeps the rule that the
sanitiser's output is a function of the values it recognises, never of what it was handed.

It is a sixth option rather than a change to the default. Every list already in the product keeps
the numbering it has; the client picks the new style where they want it.

### 5. Two fields are retired from the UI, and their columns are kept

The meeting header's **Follow-up action** and the assumption's **Mitigation plan** leave the form,
the form schema, the repository input and the write procs. Their columns, and their audit
snapshots, stay.

Dropping the columns would be the tidier change and the wrong one. The client asked for these to go
from a screen; they did not ask for text they have already typed to be destroyed, and one of the
two was phrased as a question. Keeping the column means putting the field back is a revert rather
than a migration and a restore, and the audit trail still describes rows that have the value.

The cost is a column nothing writes. That is recorded here so the next person reading the schema
knows it is deliberate rather than an oversight.

### 6. A refused table layout is reported, not swallowed

`saveListLayout` answered `void` and swallowed its own failure; the caller swallowed it again with
`.catch(() => undefined)`. A column dragged to a new place would move on screen, spring back on the
next load, and nothing anywhere would say why.

The action now answers whether it stored the layout and `DataView` raises a toast when it did not.
The arrangement still applies on screen, so the gesture is not undone — the message says only that
it will not outlast the page.

This was reached from the client's "the column reorder does not work", reported twice. **It is a
fix for the silence, not a diagnosis of the cause**: the drag itself is wired, shared with every
other list, and nothing in the to-do columns opts out of it, so the report does not reproduce from
the code. If the client now sees the toast, the cause is the preference write; if they do not, it
is the drag, and the next question is which page and which view mode.

### 7. The requirement register exports, and the exports share one set of rows

`GET /projects/<id>/requirements/export` (CSV) and `.../pdf`, following the financials routes that
already exist: Viewer on the project through the list proc, the shared per-person export window,
a file name built from the id so nothing user-typed reaches a header, `nosniff`, and the sandbox
CSP on the PDF. A project the actor cannot open answers 404, exactly as a missing one does.

Both files are pure functions of one set of already-parsed rows, so the CSV and the PDF cannot
disagree about what a requirement says. A need's "Met" cell is empty rather than "No" — only a
solution carries one, and "No" would read as a failure.

The read walks the list proc's 100-row pages rather than asking for one large page, and stops at
5000, so the cost is the project's own register rather than the tenant's.

## What this ADR does not decide

**Sub-requirements** (`FR-1.1`, then `FR-1.1.1`, for every type) are **not built**. The client asked
for them with a mock-up, and they are a tree: a self-referencing parent, a uniqueness rule per
parent rather than per type, a recursive CTE to render the path, an ordering that is the path and
not a column, cycle prevention under the project lock, and a decision about what happens to
children when a parent is deleted or merged. That is the size of the milestones-and-dependencies
item, which took its own session and still produced two defects that only CI found. Specifying it
properly is worth more than starting it, so it is specified in
`docs/client-feedback-2026-10-26.md` and reserved **ADR-0048, migration 048**.

**A print preview for the minutes** is listed as a correction the client asked for, and the app
already has one — `/projects/<id>/meetings/<meetingId>/print`, linked from the meeting page, which
is the page the client screenshotted for M2. M2's ordering is fixed there. Whether "must have a
print preview" means something beyond that page is a question for the client, not a decision here.

## Consequences

- Three migrations, all additive or metadata-only, all idempotent, none rewriting a page.
- Two columns exist that the application no longer writes, by decision 5.
- The combobox gains a capability every module can use; nothing else changes for the modules that
  do not pass the new props.
- Two `route.ts` files are added. Both are download handlers, which is the only kind this project
  adds (the security checklist's row 7).
- The numbering style, the free-text assignees and the exports are all new surface for the client
  to test, and none of them has been exercised in a browser here — only `db-apply` and the unit
  suite have run.
