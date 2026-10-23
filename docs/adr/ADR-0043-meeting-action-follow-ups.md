# ADR-0043 — An action item's status, its follow-ups, and carrying it over

- **Status:** Accepted
- **Date:** 2026-10-23
- **Supersedes:** nothing. Extends ADR-0028 (meetings data model); §4 of that ADR said an action
  item has no completion field, which decision 1 below reverses and explains.
- **Migration:** 040_meeting_action_followup.sql

## Context

Client feedback of 2026-10-23 asked for four things in the meeting minutes:

1. Under the activities, a **one-to-many** relationship for the follow-up, the person assigned and
   the due date, plus a **date field** and a **status: On hold, In progress, Completed**.
2. **Present and Apologies** moved under the **Location** field.
3. The drop-down's **"Meetings"** renamed **"Minutes"**.
4. An action item that is not complete must **carry over to the next meeting minutes and any other
   instance of meeting minutes until it is marked as complete**.

(2) and (3) are layout and wording and are recorded in the decisions only where they constrained
the structure. (1) and (4) are one piece of work: (4) needs a completion marker, which is the status
(1) asks for.

Before this, `app.MeetingActionItem` held one person responsible and one due date, and every action
counted as open because there was nothing to mark it done with.

## Decisions

### 1. The status is a closed set of three on the action item, not a managed lookup list

`app.MeetingActionItem.Status VARCHAR(12) NOT NULL DEFAULT 'in-progress'`, with
`CK_MeetingActionItem_Status CHECK ([Status] IN ('on-hold', 'in-progress', 'completed'))`.

A parking-lot-style `app.LookupList` (ADR-0022, migration 031) was rejected: `'completed'` is the
value the carry-over rule in decision 4 reads, so an admin renaming or deleting it would silently
change which actions follow a project around. Lookup lists are right for labels that only colour a
row; this one decides behaviour. `ACTION_STATUSES` in `src/modules/meetings/schemas/meeting.ts` is
the TypeScript side of the same set, and `src/tests/meeting-sql-guardrails.test.ts` fails the build
if the two drift or if a proc stops re-checking the set.

Existing rows become `'in-progress'`, which is what they were: every action counted as open before
the status existed, and `openActions()` keeps treating anything that is not `'completed'` as open.

This reverses ADR-0028 §4 ("no completion field"). That decision was made when the minutes were a
record of one meeting; the client's requirement (4) makes an action a thing with a lifetime longer
than the meeting that raised it.

### 2. A follow-up is a child row, and carries no status of its own

`app.MeetingActionFollowUp` is one-to-many under `app.MeetingActionItem`, with `FollowUp`,
`AssignedToStakeholderId`, `FollowUpDate` (the date field of requirement 1), `DueDate`, `SortOrder`
and its own `RowVer`.

The status deliberately stays on the action item alone. Putting one on each follow-up as well
would give a reader two places to look for whether the action is done, and two values that can
disagree; a guardrail asserts no follow-up proc and no follow-up column names a status.

`AssignedToStakeholderId` has **no foreign key** to `app.Stakeholder`, matching the action item: the
write procs check the stakeholder is live and in the meeting's project under `UPDLOCK, HOLDLOCK`, an
unchanged assignee stays valid after that stakeholder is deleted so old minutes keep their names,
and a FK would also block the stakeholder delete.

### 3. `usp_MeetingActionItem_SetStatus` is its own intention, separate from `_Update`

`_Update` takes the text, person responsible, due date and status together, because that is the
form that shows them all. `_SetStatus` takes the status and the `RowVer` and nothing else.

It exists for decision 4: a later meeting's carried-over list ticks an action off without ever
having read its text. An `_Update` from there would have to send fields it did not read, and would
overwrite a concurrent edit of them. `VERBS` in `src/tests/proc-access-levels.test.ts` already maps
`SetStatus` to `update`, so it demands Contributor with `meetings:update` like every other edit.

### 4. Carrying over is a derived read, not copied rows

`usp_Meeting_GetWorkspace` answers a fifth collection, `CarriedOverJson`: the actions of the
**same project's earlier meetings** whose status is not `'completed'`, capped at
`MEETING_CARRY_OVER_MAX` (500).

Copying the row into each later meeting was rejected: the same action would then exist N times, and
"until it is marked as complete" would mean marking N rows, with nothing keeping them in step. A
derived read gives the client's requirement exactly — the action appears in **every** later meeting
of the project and disappears from all of them the moment it is completed — with one row and one
writer.

"Earlier" is `(StartDate, MeetingId)` with a null `StartDate` sorting **last**, so a meeting being
drafted sees the project's open actions and never leaks into a meeting that already happened. The
list is read-only apart from the status, and links to the meeting that raised the action, which is
where its text, person and due date are edited.

Folding it into the workspace read keeps ADR-0028's "everything the workspace shows, from one
call", and means the printed minutes carry it too. It cannot leak rows across a project: the
subquery joins on `src.ProjectId = m.ProjectId`, and `usp_Meeting_GetWorkspace` has already
asserted Viewer on that project.

### 5. Present and apologies move below the header form, not inside it

The participant panel was a right-hand `<aside>`; it is now a section of the single column, directly
after the meeting header form, whose **last field is Location**.

It is not *inside* the form, because it is a `<form>` of its own with its own stamped save
(`usp_MeetingParticipant_Set` takes the stamp the panel read), and a nested `<form>` is invalid
HTML. Merging the two saves was rejected: the panel's whole-list save and the header's RowVer save
are different concurrency models, and one Save button would have to own both. Moving Location to the
end of the header form is what puts the panel under it, which is what the client asked for.

## Consequences

- Four new procs in `db/procs/meeting-action-followup/` (Create, Update, Delete, Reorder) and one
  in `meeting-action-item/` (SetStatus). No `GetById` or `List` for follow-ups: the workspace read
  serves every caller, and an unused proc is a liability.
- `usp_MeetingActionItem_Delete`, `usp_MeetingDiscussionPoint_Delete`,
  `usp_MeetingAgendaItem_Delete` and `usp_Meeting_Delete` sweep the follow-ups in the same
  transaction and name them in the audit row. In the two multi-level deletes the removed action ids
  go into their own `@Actions` table variable, so the follow-up sweep reads a table it is not also
  writing through `OUTPUT INTO`.
- `IX_MeetingActionItem_OpenByMeeting (MeetingId, Status) INCLUDE (SortOrder,
  AssignedToStakeholderId, DueDate) WHERE IsDeleted = 0` backs the carry-over read;
  `IX_MeetingActionFollowUp_ActionItem (MeetingActionItemId, IsDeleted, SortOrder)` backs the
  follow-up collection.
- The carry-over read grows with the project's unfinished actions, not with the project. The cap
  bounds it; a project past 500 open actions is already past the point where one list helps.
- No new route, no new server-action surface beyond the module's own, no new dependency.

## What this does not do

- It does not notify anyone that an action carried over. The to-do alert machinery (ADR-0031) is a
  separate surface and nobody asked for it here.
- It does not let the carried-over list edit anything but the status. The action's text, person
  responsible and due date are edited in the meeting that raised it, which the list links to.
- There is no bulk completion: each action is completed on its own, so each one gets its own
  `RowVer` check and its own audit row.
