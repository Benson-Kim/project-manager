# ADR-0028 — Meetings data model

Status: Accepted · Date: 2026-10-14 · Session: meetings M1 (module #10, checklist rows 12, 13, 53, 54, 72)
Builds on ADR-0021 (access levels), ADR-0023 (datasheet rows), ADR-0024 (per-person overrides) and
ADR-0025 (rich text).

## Context

The client asked for meeting minutes (checklist row 12), several per project (row 53), with the
fields of rows 54 and 72:

- a title, the date received, an objective;
- the location, the agenda, start and end times, a follow-up action;
- a participant list built from the project's stakeholders, where you tick who attended.

Row 13 asks for a "Person responsible" dropdown fed by the project's stakeholders.

The Access source nests the minutes as Meeting → Agenda → Discussion points → Action items. Each
participant is marked as attended or apology. The minutes print as `rptMeetingMinutes`, with
`qryMeetingAttendees` and `qryMeetingApologies` labelling each person "Name - Position,
Organization".

Migration 003 already holds the five tables (`app.Meeting`, `MeetingAgendaItem`,
`MeetingDiscussionPoint`, `MeetingParticipant`, `MeetingActionItem`). Seeds 008–012 fill them,
including legacy orphans: meeting 5 has no project, agenda item 3 has no meeting, and
participants 1 and 3 have no meeting. The 28 procs predated ADR-0021:

- they ran no access check;
- they did not check that parents exist;
- an update could move a row to another project or parent;
- a delete did not cascade.

## Decision

### 1. Schema (migration 024, backfills in seed 032)

- `Meeting.DateReceived DATE NULL` and `Meeting.Objective NVARCHAR(MAX) NULL` (row 54).
- **The title is `Subject`**, relabelled "Title" in the UI. No new column.
- `SortOrder INT NOT NULL DEFAULT 0` on agenda items, discussion points and action items.
- `MeetingActionItem.MeetingId INT NULL` (foreign key). The procs fill it in from the parent, so an
  action under an agenda item with no discussion point still belongs to its meeting, and the
  workspace reads all of a meeting's actions with one index seek.
- One live participant row per stakeholder per meeting: a filtered unique index on
  `(MeetingId, StakeholderId) WHERE IsDeleted = 0 AND MeetingId IS NOT NULL`. Existing duplicates
  are soft-deleted first, keeping the lowest id.
- `IX_Meeting_Project_StartDate` serves the list's default sort.

Seeds run after the migrations on every `db-apply`, so the backfills live in seed 032:

- action `AgendaItemId` and `MeetingId` come from the discussion point and the agenda item;
- `SortOrder` is numbered by id among siblings.

Each step touches only rows not yet backfilled (`SortOrder = 0`, `MeetingId IS NULL`), so running
it again changes nothing. The seed counts do not change.

### 2. Access

The levels follow ADR-0021:

| Action | Level needed |
|---|---|
| Read | Viewer |
| Create and update | Contributor (`meetings` is in `CONTRIBUTOR_WRITE_MODULES`) |
| Delete | Manager |

Every write passes `@Permission = N'meetings:<verb>'`, so a project Manager can grant or revoke
each verb per person (ADR-0024). `meetings` is registered in all three override lists.

Each child row is checked through its chain of parents to the project:

- action → discussion point → agenda item → meeting → project;
- participant → meeting → project.

A row whose chain ends without a project (the legacy orphans) is open to Admin only
(`@AllowProjectless = 0`); anyone else gets FORBIDDEN_ROW. A parent named in a create must be live
and must sit in a project the actor can write to. A reorder or a participant save that names a row
from another meeting is refused.

The procs return stakeholder labels only, never contact details.

### 3. Nothing moves

- **A meeting never changes project.** `usp_Meeting_Update` still accepts `@ProjectId`, so callers
  written before this ADR keep working, but ignores it. The update form has no project field, so a
  legacy project-less meeting stays editable by Admin.
- **Child updates take no parent ids.**
  - Agenda items change their text only.
  - Discussion points change their text only.
  - Participants change only whether they sent an apology.
  - Action items change their text, the person responsible and the due date.
- **An action's parent** is its discussion point, or, if it has none, its agenda item.
  - The client sends one or both. The proc derives the agenda item and the meeting.
  - A discussion point paired with an agenda item that is not its own is VALIDATION.
  - The parent never changes after creation.

### 4. Person responsible (row 13)

"Person responsible" is the action item's `AssignedToStakeholderId`, the only responsible-person
field in the live Access schema. Access's `qryMeetingMinutes Extended` reads a
`tblMeetingMinutes.PersonResponsible` that the tables no longer have. That query is stale and is
not carried over.

- A new or changed person responsible must be a live stakeholder of the meeting's project.
- Saving an action whose person responsible was deleted since keeps that person: the check runs
  only when the value changes.

There is no completion field, so every action counts as open. An action is overdue when its due
date is before today.

### 5. Participants

Participants are stakeholders of the meeting's project:

- `IsApology = 0` means attended;
- `IsApology = 1` means sent apologies;
- having no row means not invited.

Labels are built as `qryMeetingAttendees` builds them: "First Last - Position, Organization",
leaving out an empty part. The two runners apply the proc folders in different orders: the bash
`db-apply` puts `meeting-*/` before `meeting/`, Electron puts `meeting/` first. A function shared
across the folders would therefore break one runner, so each proc writes the label expression out
in full. A guardrail test keeps the copies identical.

The participant panel saves with `usp_MeetingParticipant_Set @MeetingId, @ParticipantsJson
([{stakeholderId, isApology}]), @Stamp`. The set it sends replaces the meeting's participants, but
only among the project's live stakeholders:

- a listed stakeholder without a row is added;
- a listed stakeholder with a row is switched to the flag sent;
- a project stakeholder who is not listed is removed (soft delete);
- rows for deleted stakeholders, or for stakeholders of another project, are left alone.

`@Stamp` is the highest RowVer among the meeting's participant rows, deleted rows included, as the
panel read it (`ParticipantsStamp` from `usp_Meeting_GetWorkspace`). A save made from an older
stamp is CONFLICT.

The listed stakeholders are checked inside the transaction, with their rows read under `UPDLOCK,
HOLDLOCK`. `usp_Stakeholder_Delete` takes no meeting lock, so a check made before the transaction
could pass for a stakeholder deleted a moment later; under the lock the delete either lands first
and the save is VALIDATION, or it waits for the save. `usp_MeetingParticipant_Create` and the
action's person responsible (`usp_MeetingActionItem_Create` / `_Update`) check the same way.

Removing someone through Set is an edit of the meeting's attendance, so it needs `meetings:update`
(Contributor). Deleting a single participant row with `usp_MeetingParticipant_Delete` stays a
Manager delete.

### 6. Concurrency: lock the meeting, then check

Every proc that changes which children a meeting has, or their order, opens a transaction and takes
`UPDLOCK, HOLDLOCK` on the meeting row before it checks anything:

- the creates and deletes of agenda items, discussion points, actions and participants;
- the three reorders;
- the participant set, and a participant's update.

RowVer (and the participant stamp) is checked inside that transaction.

The lock is on the meeting, not the project (ADR-0027 locks the project). Every sibling set lives
inside one meeting, and neither a meeting nor its children ever change project, so the meeting row
is enough. A project lock would also queue unrelated meetings, and the project's WBS edits, behind
each other.

### 7. Reorder contract

`usp_MeetingAgendaItem_Reorder @MeetingId`, `usp_MeetingDiscussionPoint_Reorder @AgendaItemId` and
`usp_MeetingActionItem_Reorder @DiscussionPointId | @AgendaItemId` (exactly one) each take
`@OrderJson = [{id, rowVer}]`.

**Before the lock**, these are VALIDATION:

- JSON that is not an array;
- an id or rowVer that is not a number (`TRY_CAST`);
- more than 500 entries;
- a repeated id.

**Under the lock**, the list must be exactly the parent's live children, each at the RowVer the
client read. Anything else is CONFLICT: a missing sibling, an extra one, one from elsewhere, or a
stale RowVer. Positions become 1…n, and one audit row records the new order.

The live children are read once, under `UPDLOCK, HOLDLOCK`, into the snapshot the check, the
audit's before-image and the UPDATE all use. The meeting lock alone serialises adds, deletes and
reorders, but not an edit: `_Update` checks its own RowVer and takes no meeting lock, so an edit
between the check and the UPDATE would let both succeed. With the rows locked, the edit either
commits first (a stale RowVer, CONFLICT) or waits for the reorder.

### 8. One workspace read

`execProc` reads only the first recordset. `usp_Meeting_GetWorkspace` therefore returns one row:

- the meeting's fields;
- its agenda items, discussion points, actions and participants as `FOR JSON PATH,
  INCLUDE_NULL_VALUES` columns, each in display order;
- `ParticipantsStamp`, and a `Stamp` (`MIN_ACTIVE_ROWVERSION()`).

Without `INCLUDE_NULL_VALUES`, FOR JSON drops null keys and the zod schema would refuse the row.
Each action carries `AssigneeName`.

Every minutes or participant edit answers with the whole workspace, re-read for the meeting the
proc reports rather than one the caller names. The page shows that answer in place of its own
guess, as the WBS editor does (ADR-0027 §5).

Child lists are not paged. A meeting has tens of items, and the reorder limit is 500.

### 9. List and search

`usp_Meeting_List` follows ADR-0016:

- **Search** covers Subject, Location and Objective. The user chose to keep Objective even though
  it is stored HTML, so a search can match markup such as `strong`. LIKE wildcards are escaped.
- **Sorting** allows StartDate, Subject, Location and DateReceived. The default puts undated
  meetings (new drafts) first, then the newest.
- **`@DateFrom` / `@DateTo`** filter on StartDate, inclusive.
- **Rows** carry the rich fields in full (ADR-0023), attendee and apology counts, and
  `ActorAccess` / `ActorGrants` / `ActorRevokes`.

### 10. Drafts and legacy times

- **New meeting creates an empty draft at once** (user decision 2026-10-14). The workspace opens
  on it, and the header asks for the title when it is saved.
  - `usp_Meeting_Create` therefore requires only the project.
  - An end time not after the start time is VALIDATION.
- **Legacy "no time" values.** Access saved "no time" as 00:00–00:00, as meeting 3 shows.
  - The form reads that pair as no times.
  - `usp_Meeting_Update` checks the times only when they change, so a legacy row stays saveable.
- **Rich fields.** Description, Objective, Conclusion and the discussion point are rich text
  (ADR-0025). Agenda items and actions are plain text.

### 11. Delete

- `usp_Meeting_Delete` soft-deletes the meeting with its actions, discussion points, agenda items
  and participants in one transaction. One audit row lists the ids removed.
- An agenda item's delete takes its discussion points and every action under it.
- A discussion point's delete takes its actions.

## Consequences

- The proc-access guardrail (`src/tests/proc-access-levels.test.ts`) covers the five meeting
  folders.
- `src/tests/meeting-sql-guardrails.test.ts` pins the rules above:
  - the identical labels and the absence of contact columns;
  - the locks and the in-transaction checks;
  - that child updates take no parent ids;
  - LIKE escaping, no dynamic SQL, the JSON limits and `INCLUDE_NULL_VALUES`;
  - that no meeting proc calls another.
- The behaviour was checked case by case against a local database: about 70 cases, each in a
  rolled-back transaction. That check is not part of CI (user decision 2026-10-14). The db-apply
  CI job applies the migration, the procs and seed 032 with unchanged seed counts.
- Writes to one meeting's minutes are serialised, which is cheap at this scale.

## Amendment 2026-10-14: the participant roster (M3)

The panel lists everyone it can mark, not only the current participants, so it reads a new proc,
`usp_Meeting_GetRoster @MeetingId` (Viewer on the meeting's project). It answers one row:

- `ParticipantsStamp`, computed as in `usp_Meeting_GetWorkspace` but read BEFORE the people. A
  participant change that lands between the two reads makes the panel's rows newer than its stamp,
  so the save is a CONFLICT instead of overwriting that change. The page reads the workspace and
  the roster in parallel, so the panel never pairs the workspace's stamp with the roster's rows.
- `RosterJson` (`FOR JSON PATH, INCLUDE_NULL_VALUES`), `[{StakeholderId, Label,
  MeetingParticipantId, IsApology, IsHistorical}]`:
  - every live stakeholder of the meeting's project, LEFT JOINed to their live participant row
    (`MeetingParticipantId` and `IsApology` null = not invited);
  - then the meeting's participants who are not live stakeholders of the project
    (`IsHistorical = 1`). These are exactly the rows Set leaves alone (§5), so the panel shows them
    read-only and never sends them.
  - Each part is in name order. The label is written out in full, as §5 requires.
- The meeting's participants are always listed; the other stakeholders fill what is left of 1000
  places (Set's limit, `MEETING_PARTICIPANTS_MAX`). A save from a cut roster therefore never
  removes a participant the panel did not show. A meeting with more than 1000 participants lists
  them all; the save then exceeds Set's limit and is VALIDATION, never a silent uninvite. (Until
  2026-10-17 the cap counted the participants too, historical ones first, so a live participant
  past it was left out and uninvited by the next save.)

The panel keeps the choices the user made over what the roster read. Save sends Set the live
attendees and apologies once, with the roster's stamp; Set answers with the re-read workspace,
whose participants become the panel's new saved state. The radios stay live while the save runs;
a pick made meanwhile is kept over what the save stored (`choicesAfterSave`), so the panel stays
dirty until it is saved too. A page refresh that brings a newer stamp replaces the panel's roster
only when it holds no unsaved choices; otherwise the save conflicts and Reload takes the newer
roster. A refresh that brings an older stamp (two refreshes finishing out of order, one started
before a save) is ignored, as the WBS editor ignores an older read.

The header form and the panel share one unsaved-changes guard (`UnsavedChangesScope`,
`src/components/ui/form/unsaved-scope.tsx`): each guard intercepts navigation on its own, so two
would ask twice. The parts report whether they are dirty and the scope asks once. The guard also
covers the browser's Back / Forward (`use-unsaved-changes-guard.ts`, 2026-10-17, for every form
that uses the guard): the App Router handles `popstate` itself, without `pushState` /
`replaceState`, and window listeners run in registration order, so a page's own popstate listener
can never run first. The hook cancels the traversal in the Navigation API's `navigate` event, which
fires before the URL changes (browsers allow that once the user has interacted with the page);
Discard makes the traversal again. Without the Navigation API, Back stays unguarded.

The stakeholder picker moved to the stakeholders module (`stakeholders/repository/
stakeholder-options.ts`, `stakeholders/components/stakeholder-picker.tsx`), which ADR-0001 allows
other modules to use. Key deliverables uses it unchanged; the meeting action items (M4) will too.

## Amendment 2026-10-15: the minutes editor and the printed minutes (M4)

No schema or proc change: the minutes use the procs and actions of M1.

**The editor** (`components/minutes-editor.tsx`, in the workspace's main column) shows the agenda
in order, each item's discussion points (rich text), and the actions under a discussion point or
directly under the agenda item. The tree is built by `buildMinutes` (`schemas/minutes.ts`), which
leaves out children whose parent the workspace does not hold.

- **Add, edit inline, delete, move.** Every level has an Add button under its parent, Edit (the
  item turns into a small form with Save and Cancel), Delete behind a ConfirmDialog that says what
  goes with it (§11), and Move up / Move down buttons. The buttons name the item they act on
  ("Move Budget up"). Moves are buttons, not drag and drop (ADR-0007 makes drag optional); each
  move keeps focus on the moved item's button and announces the new position.
- **One answer replaces the view.** Every change answers with the whole workspace (§8). The
  editor shows it unless a newer read (a higher `Stamp`) has already arrived, and takes a page
  refresh's workspace on the same rule. Moves and deletes wait for each other, so a second move
  is always sent with the RowVers the first one answered with.
- **RowVer per item.** An edit saves with the RowVer of the item as it was when the edit began.
  When the item changed only in position since (a reorder renumbers its siblings, and so bumps
  their RowVer), the edit moves to the newer RowVer; any other change keeps the old one, so the
  save is a CONFLICT and Reload drops the draft and reads the meeting again (`editRowVer`).
- **Rich text stays behind the ADR-0025 boundary.** The page renders each discussion point with
  `RichTextView` on the server and passes the node with the HTML it came from, as the datasheet's
  rich cell does. After a save the editor shows plain text until the refresh it asks for brings
  the new node.
- **Person responsible** (row 13) is the shared single-choice `StakeholderSelect` (stakeholders
  module, on the shared `Combobox`). Its options are the roster's live stakeholders, labelled
  "Name - Position, Organization": the page already reads the roster, which is not capped at 100
  like `listStakeholderOptions`, and the label tells two people of the same name apart. An
  action whose person responsible is no longer a live stakeholder keeps them on offer, so saving
  its text keeps them (§4).
- **Unsaved changes.** Each open minutes form reports to the page's `UnsavedChangesScope`, under
  a name unique on the page. The shared guard no longer treats a refresh as leaving the page: the
  App Router re-writes the current URL with `replaceState` on every commit, `router.refresh()`
  included, so a save that refreshed the page while another form was dirty asked to discard it
  (since M3: a participant save with the header unsaved). Only a history call that changes the
  path or the query asks now (`leavesPage`, `src/components/ui/form/unsaved-guard.ts`).
- **Open actions.** Every action is open (§4). The editor lists the meeting's actions above the
  agenda, by due date with undated ones last, and marks those due before today. "Today" is the
  server's calendar date, passed to the browser, so both render the same marks.

**The printed minutes** are `/projects/[id]/meetings/[meetingId]/print`, in the `(print)` route
group, so the app shell (header and navigation) never renders. The page follows
`rptMeetingMinutes`: the title and header fields, who was present and who sent apologies, the
agenda with its discussion points and an action table under each (action, person responsible,
due date), then the conclusion, the follow-up action and the next meeting.

- It reads the workspace once and takes the attendees and apologies from its participants, so
  the page is one consistent snapshot. `usp_Meeting_GetAttendees` and `_GetApologies` return the
  same rows and stay available.
- Access is the workspace's: Viewer on the meeting's project, and `guardProjectScope` turns a
  meeting of another project into not found.
- "Print minutes" calls `window.print()` over the print stylesheet, which works the same in the
  desktop app. The minutes print on a named page (`@page minutes`, A4 portrait), so the Gantt
  keeps its landscape page.
