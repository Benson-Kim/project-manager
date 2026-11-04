# ADR-0059: Recurring to-dos and the to-do calendar

- Status: Accepted. The choices marked "default" are ours, not the client's, and can be changed.
  Built so far: slices 1 to 3. The calendar view (decision 6, slice 4) is not built yet.
- Date: 2026-11-04

## Context

A to-do has one StartDate and one DueDate. The client chose "repeat on a set frequency" with
patterns, and asked for hourly repeats as well as daily, weekly and monthly ones. A repeat ends
on a date or after a set number of times, and each repeat shows in a calendar built from the
to-dos' start dates. The app has no calendar today.

`app.TodoAlert` already has `RepeatUnit` and `RepeatInterval`, but nothing reads them: an alert
fires once and dismissing it ends it. They describe an alert, not the to-do, and this ADR leaves
them alone.

## Decision

1. A rule lives in a new 1:1 table, `app.TodoRecurrence`, keyed on the to-do (the series). A
   to-do with no row does not repeat, so existing to-dos and procs are unchanged.
   - Unit: Hour, Day, Week or Month. Interval: 1 to 999.
   - Week: a weekday bitmask with at least one day set.
   - Month: one of three modes:
     - day of month, taken from the start;
     - Nth weekday, where N is 1 to 4 or the last one;
     - last day.
   - The rule ends on a date (`EndsOn`), after a count (`EndsAfter`, 1 to 999), or never, which
     is the default. A CHECK constraint allows at most one ending, and other CHECKs keep each
     unit's fields consistent.
   - "Every second Tuesday" can be stored both ways: every 2 weeks on Tuesday, or the 2nd Tuesday
     of every month.
   - Default: a day-of-month rule set to the 29th, 30th or 31st falls on the last day of a shorter
     month, rather than skipping that month.
2. Occurrences are worked out when they are read, for a date window. They are never stored ahead.
   - One pure function, `expandOccurrences`, produces them, starting from the series' StartDate.
     Each occurrence keeps the series' length (DueDate minus StartDate).
   - Dates and times are wall clock, so a clock change never moves an occurrence.
   - An hourly rule needs a start time. It is kept on the rule, since a to-do's dates are
     calendar days.
   - A window is at most 62 days, and one series yields at most 1,000 occurrences per window. The
     screen says when the list was cut short.
   - `EndsAfter` counts from the first occurrence, not from the window.
3. An occurrence gets its own row only when it is changed: marked done, moved or skipped. This is
   `app.TodoOccurrence`, keyed on the series and the generated start, which is unique per series.
   - Completing an occurrence leaves the series open.
   - Completing or cancelling the series itself ends all later occurrences. Past ones are kept.
4. Changes apply to "This one" or "The whole series".
   - When how a series repeats changes, the rows for its future occurrences are deleted, as
     Outlook does, and the form says so first. Rows for past occurrences are kept. Changing only
     the ending keeps them all. The database cannot tell which future rows a new rule still
     produces without working occurrences out in SQL, which decision 2 rules out.
   - "This and following", which would split the series, is not offered. It can be added later
     without changing this model.
5. The to-do list shows each series once, with its next open occurrence and a "Repeats" badge.
   - Overdue and "Due soon" (ADR-0056) are judged on the earliest open occurrence.
   - Default: only open occurrences from the last 31 days count as overdue.
   - Alerts stay as they are, one per alert row. Default: a reminder before each occurrence is
     left for a later change.
6. A Calendar view is added on /todo and on each project's to-do page, next to list and grid.
   - It shows a month grid, and an agenda list at phone width.
   - A to-do appears on its StartDate. Each occurrence appears on its own day. A day shows up to
     three entries, then "+N more".
   - The data comes from `usp_Todo_ListCalendar(@ActorUserId, @ProjectId, @From, @To)`. It returns
     the one-off to-dos and the series that overlap the window, with their rules and the
     occurrence rows inside the window, and it filters by `ufn_TodoItem_AccessLevel` the way the
     list does. It refuses a window longer than 62 days.
7. Writes are protected the same way everywhere:
   - The input schemas are strict, and the database CHECKs repeat the per-unit rules.
   - Every rule or occurrence write checks access to the series (`usp_TodoItem_AssertAccess`) and
     is audited in the same transaction.
   - A rule has no RowVer of its own. Rule writes check the series' RowVer and move it, so a to-do
     form opened before the change conflicts. An occurrence row has its own RowVer, so marking
     one occurrence done does not invalidate an open series form.

## Consequences

- No to-do changes until someone gives it a rule. Removing the rule makes it a one-off again.
- Reads cost one proc call and an in-memory expansion per window. The 62-day window and the
  1,000 cap bound that cost, even for hourly series.
- An hourly series over two months is cut short. The cut is visible on screen.
- Work comes in four slices:
  1. migration 061, the procs and db tests;
  2. the expansion and its unit tests;
  3. the form's Repeat section, the actions and the list badge;
  4. the calendar view and its e2e tests.
