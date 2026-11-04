# ADR-0056 — Per-user settings, starting with the "Due soon" window

- **Status**: Accepted
- **Date**: 2026-11-04
- **Module**: todo-items (#16), settings
- **Supersedes**: nothing. **Superseded by**: nothing.

## Context

Client backlog **BL08** asks for an alert time and a "Due soon" interval each user chooses.
Until now a to-do was "Due soon" two days before its due date, a constant written into
`usp_Todo_GetUpcomingAlerts` (`DATEADD(DAY, -2, DueDate)`) and into `isApproachingDeadline`.
The Settings page was a placeholder. View preferences (`app.ViewPreference`, ADR-0023) are
keyed by module and hold UI layout, not settings that procs read.

## Decision

1. **`app.UserPreference`** (migration 059): one row per user, `UserId` is the primary key and
   a foreign key to `auth.[User]`. The first column is `DueSoonDays TINYINT NOT NULL DEFAULT 2`
   with `CHECK (DueSoonDays BETWEEN 1 AND 30)`. A user with no row gets the defaults, so nothing
   is back-filled. Later per-user settings (for example the BL09 idle timeout) add columns here.
2. **Procs**: `usp_UserPreference_Get` returns one row (the defaults when none is stored);
   `usp_UserPreference_SetDueSoonDays` validates 1..30 and upserts. Both take `@ActorUserId`
   only, so a user can read and write only their own row.
3. **One window everywhere**: `usp_Todo_GetUpcomingAlerts` reads the user's `DueSoonDays`
   (2 when no row). `isApproachingDeadline(row, dueSoonDays)` takes the same number, and both
   to-do pages pass it to `TodoView`, so the list, the cards and the Upcoming alerts panel agree.
4. **Settings page**: a "To-dos" section with a "Due soon" select. The options are
   `DUE_SOON_DAY_OPTIONS` (1, 2, 3, 5, 7, 14 days). `setDueSoonDaysAction` runs through
   `action()` with `todo-items:read`: every account that sees to-dos may set it.
5. **Not audited**: it is the user's own display setting, not project data (the same exemption
   as view preferences, STANDARDS §6).
6. **Alert time**: the Upcoming alerts panel shows each alert's own day and time. Due dates stay
   date-only.

## Consequences

- A guardrail (`src/tests/user-preference-sql-guardrails.test.ts`) fails when the proc goes
  back to a fixed window, or when the SQL and TypeScript defaults or ranges drift apart.
- The setting follows the user across machines, because it lives in the database, not in a
  cookie.
- Offering a value outside 1..30 needs a migration as well as a change to the option list.
