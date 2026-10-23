# ADR-0044 — Why an action is on hold, and sorting a list from its column headers

- **Status:** Accepted
- **Date:** 2026-10-23
- **Supersedes:** nothing. Extends ADR-0043 (the action item's status) and ADR-0016/ADR-0023 (the
  list contract and the datasheet).
- **Migration:** 041_meeting_action_on_hold_reason.sql

## Context

Three asks from the client, on the day ADR-0043 landed:

1. **"For on-hold status, we can supply a reason."** ADR-0043 gave an action item one of three
   statuses. A hold says an action is waiting; it does not say what for, and the next meeting reads
   the minutes without the conversation that produced them.
2. **"Each table column gets an up/down pointing triangle to order ascending or descending."** The
   list procs have taken `@SortBy` and `@SortDir` since ADR-0016 and every list page already
   forwards the URL's `?sort=`/`?dir=` to them, but nothing in the UI ever set them: the order was
   whatever the page hard-coded.
3. **"All columns need to stick on vertical scroll"** and **"for tables that scroll horizontally, a
   sticky horizontal scroller so the user is not forced to scroll all the way down to see a
   scroller."** The header row has stuck to the top of the table's own scroll box since the client
   feedback of 2026-10-12; the horizontal scrollbar sits at the bottom edge of that box, which is a
   screen tall.

## Decisions

### 1. The reason belongs to the hold, and the table says so

`app.MeetingActionItem.OnHoldReason NVARCHAR(500) NULL`, with
`CK_MeetingActionItem_OnHoldReason CHECK ([OnHoldReason] IS NULL OR [Status] = 'on-hold')` as a
**table-level** constraint — a column CHECK naming a second column is SQL Server error 8141, raised
on apply (`src/tests/migration-check-constraints.test.ts`).

It is optional: the client asked to be *able* to give a reason, not to be made to.

Keeping it only while the status is the hold was chosen over keeping it for ever and hiding it:

- A row that says `completed` and carries "waiting on the supplier" is a row two readers will read
  two ways. The constraint means the question "is this reason current?" cannot be asked.
- Nothing is lost by clearing it. Every write proc snapshots the row into `audit.AuditLog`, and
  `usp_MeetingActionItem_SetStatus`'s `BeforeJson` is the record of the reason a hold just ended
  with. The history of a hold is in the audit trail, which is where history belongs.

The alternative — a `MeetingActionHold` table, one row per hold, so a second hold does not overwrite
the first one's reason — was rejected as more machinery than the ask: the client wants to read why an
action is waiting now. The audit trail already answers "what did it say in June".

### 2. A reason that does not belong to a hold is refused, not dropped

All three procs that write a status (`_Create`, `_Update`, `_SetStatus`) take
`@OnHoldReason NVARCHAR(500) = NULL`, trim it to `NULL` when it is blank, and
`THROW 50004 VALIDATION` when it arrives with any status but `'on-hold'`. The write always carries
the column, so moving an action on clears what was there.

The zod schemas do the opposite, on purpose: `heldReasonOnly` drops the reason when the status is not
the hold. The status select and the reason box sit side by side in one form, so a legitimate form can
post both — the last thing the writer touched is the status, and refusing their save would be
punishing them for the shape of the form. The schema is what makes the pair unreachable from the UI;
the proc's refusal is what makes a *caller that stopped doing that* visible instead of silently
losing what someone typed. Both rules exist because they answer different questions.

### 3. The hold asks for its reason before anything is written

Picking "On hold" opens a dialog — the reason, **Put on hold** (without one) and **Cancel** — and the
status and the reason reach the proc in one call. The workflow lives in `MinutesEditor`'s `setStatus`,
so the action's own row and a later meeting's carried-over list both get it without either knowing
about the dialog; they report the pick.

Writing the status first and the reason second was rejected: the second write is the one that does
not happen, and until it does the row is a hold with no reason. One call is also one audit row.

`ActionStatusCell` now renders the picker, the badge and the reason in both lists. The two lists had
the same picker-or-badge markup copied; one component is what stops the reason reaching only one.

Deferring the write makes the select **controlled** by the row's status, which it was not before.
Between the pick and the write there is now a moment where the select has moved and the row has not,
and an uncontrolled select keeps whatever was chosen through that moment and past a cancel — the list
would sit there showing a status nobody saved. A form keeps `defaultValue`, because what it shows is
a draft and FormData is what reads it.

### 4. A column offers an order only if its proc applies it

`ListSort` (`src/lib/list-params.ts`) is one constant per module, declared beside that module's row
schema: the `@SortBy` tokens its `usp_<Entity>_List` honours, the token it is given when the URL
names none, and that default's direction. `parseListParams(raw, X_SORT)` resolves the URL against it,
so the page sends the proc a column the proc knows; `DataView sort={X_SORT}` gives the same constant
to the header, which draws a control only for a column the list names.

This matters because an unknown `@SortBy` is **inert, not an error**. The procs compare it inside
`ORDER BY CASE` (never concatenate it — there is no dynamic SQL anywhere in `db/procs`), so a token
they do not know falls through to the tie-breaker: the rows come back in the default order while the
arrow claims otherwise, and nothing throws. `src/tests/list-sort-whitelist.test.ts` reads each proc's
own ORDER BY — not its header comment, which spells every token out as prose — and fails the build
when a constant and its proc disagree.

Only one module validated `?sort=` before this (Q&A, with a local `Set`); the rest passed the URL
straight through. That was never an injection, for the reason above, but it is now one rule in one
place for all twelve.

Thirteen modules declare one. The notes list (ADR-0035) landed on `develop` while this branch was
open and arrived with no contract; the guardrail's count assertion is what caught it, which is the
case it exists for.

Two columns ask for a token that is not their key (`ActivityStatus` → `Status`,
`WbsCode` → `Wbs`), because a column key is part of the layout stored per user (migration 019) and
renaming one would discard everybody's saved column order. `DataViewColumn.sort` carries the token
for those; the key is the token everywhere else.

The triangles are a pair, both drawn at once so a column says what it offers before it is clicked,
and the applied one filled. One click reverses the order; there is no third "unsorted" state, because
the proc's default order is not a column and a control that cycled back to it would be claiming
otherwise. Objectives declares no `ListSort`: its proc orders by `ObjectiveId` alone, so its headers
carry nothing.

### 5. The stuck header keeps its own edges, and a wide table gets a second scrollbar

`position: sticky` moves from the `<thead>` to the `<th>` cells. With `border-collapse: collapse` the
borders belong to the table, not the cells, so they scroll away with it and a stuck header row loses
its grid lines — the row stays put and stops reading as a header, which is what "I need to know which
column I am in" describes. The cells carry an inset shadow for the two edges the collapse takes away.

`StickyScrollbar` is a second horizontal scrollbar for the table, pinned to the bottom of the
viewport, mirroring the box's `scrollLeft` in both directions. It renders only while the table is
wider than its box, is `aria-hidden` and outside the tab order (it duplicates a scroller that already
holds the rows, and two tab stops for one scroll would be a second control), and is not printed. It
carries explicit scrollbar styling because it is the only thing in its box, and a platform that
overlays scrollbars would otherwise leave it invisible.

The navigation arrows the client first asked for (item 13 of the feedback) are not built: a scrollbar
is the control the platform already gives for this, and arrows would be a second way to do the same
thing.

**What this does not fix.** The table scrolls in its own box because an `overflow-x` scroller captures
vertical stickiness too, and the page scrolls as well. When the page is scrolled far enough, that
box's top — and the header stuck to it — can pass under the app header. Fixing that means one
scroller for the page, which is a layout decision for its own ADR; nothing browser-shaped runs in
this workspace to measure it with.

## The invariant matrix

| Invariant | Enforced by | Strength |
|---|---|---|
| Only an action on hold carries a reason | `CK_MeetingActionItem_OnHoldReason` | strong |
| The reason never exceeds its column | `NVARCHAR(500)` + `ON_HOLD_REASON_MAX` in zod | strong |
| A status change writes exactly one audit row carrying the reason | the procs' in-transaction `INSERT` | strong |
| A concurrent edit cannot lose a reason | `CAST(RowVer AS BIGINT) = @RowVer` → 50002 | strong |
| Only the three statuses exist | `CK_MeetingActionItem_Status` + `ACTION_STATUSES` | strong |
| A header offers only an order its proc applies | `list-sort-whitelist.test.ts` reads the ORDER BY | guardrail |
| Every list view hands the DataView its module's `ListSort` | the same guardrail | guardrail |

## Consequences

- Migration 041 and five changed procs have **never run** on a server from this workspace, and no
  browser has opened any of this. The commit is tagged `[db]` and `[e2e]`.
- The meetings module has no `db/tests/*-procs.cjs` behaviour script, so the new refusal
  (50004 for a reason without a hold) is asserted against the proc text, not against a server. The
  `db-apply` job proves the migration applies, is idempotent and that every proc creates.
- `e2e/meeting-minutes.spec.ts` covers the dialog in a browser: a cancelled pick leaves the select on
  the status the row still has, an answered one writes both, the reason survives a reload, and
  completing the action clears it. It had never run when it was written.
- Daily activities now actually lists newest-first. Both of its pages documented that order and asked
  for it with `listParams.dir ?? "desc"`, which the list schema's own `"asc"` default made dead code;
  `defaultDir` on `DAILY_ACTIVITY_SORT` is where that default lives now.
