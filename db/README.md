# db/

- `migrations/` — numbered, idempotent DDL (`NNN_description.sql`). Tables, FKs, indexes, constraints. Applied exactly once, tracked in `app.SchemaMigrations` — a merged migration is immutable (fix forward).
- `procs/` — one folder per entity, one file per stored procedure (`usp_<Entity>_<Action>.sql`, `CREATE OR ALTER`). **All application data access goes through these procs** — no inline SQL anywhere in the app.
- `seed/` — data migrated from the original Access database, idempotent, original IDs preserved via `IDENTITY_INSERT`. Source of truth: `docs/source/analysis/access-database.md` §4 (full row dump) — and nothing else. The seeds ARE the import mechanism (checklist row 61).
- `verify/` — CI-only assertions (`seed_counts.sql` fails the `db:apply` job when any table's row count deviates from the §4 inventory).

Apply everything to a running SQL Server with:

```sh
./scripts/db-apply.sh            # uses DB_SERVER/DB_USER/DB_PASSWORD env vars; sqlcmd -I is required (filtered indexes)
```

CI proof: the `db:apply` job (opt-in `[db]` commit flag; automatic on develop/main when `db/**` changes) applies migrations + procs + seeds to a clean SQL Server 2022 service container **twice** (idempotence is asserted, not assumed) and then runs `verify/seed_counts.sql`.

## Migrations

| NNN | Contents |
|---|---|
| 001 | Database, schemas (`app`/`auth`/`audit`), `app.SchemaMigrations`, `audit.AuditLog`, `app.ActivityStatus` lookup |
| 002 | `app.ViewPreference` (ADR-0006) |
| 003 | Full domain schema (module #3): 26 entity tables per STANDARDS §2.2 + `app.FinancialDocumentType` lookup. See the header of `003_domain_schema.sql` for the recorded structural decisions (TodoItem/TodoAlert split, FinancialDocument junction, MeetingParticipant surrogate PK, ProjectAssignee, TIME(0) mapping, dropped attachment refs). |

## Stored-procedure catalogue (after module #3)

**CRUD — 5 procs per entity** (`usp_<Entity>_{Create,GetById,List,Update,Delete}`) for:
Project, ProjectAssignee, Stakeholder, Supplier, Keyword, KeyDeliverable, Objective,
Meeting, MeetingAgendaItem, MeetingDiscussionPoint, MeetingActionItem, MeetingParticipant,
QuestionAnswer, AssumptionConstraint, RiskIssue, Note, NoteTab, ItResourceCategory,
ItResourceItem, Financial, FinancialDocument, ParkingLotItem, DailyActivity, TodoItem,
TodoAlert, ExistingSystemInterface (26 entities, 130 procs).

Contracts (uniform, generated together):

- `Create` — validates required params (`50004 VALIDATION`), inserts with `CreatedBy = @ActorUserId`, writes the `audit.AuditLog` row **in the same transaction** (`SET XACT_ABORT ON`), returns the new row.
- `GetById` — active rows only; `50001 NOT_FOUND` when absent or soft-deleted.
- `List` — exact ADR-0016 signature (`@ActorUserId, @ProjectId, @Search, @SortBy, @SortDir, @Page, @PageSize` + nullable child filters, e.g. `@MeetingId`); one result set with `TotalCount = COUNT(*) OVER ()`; `OFFSET…FETCH`; `@SortBy` whitelisted via `CASE` (never dynamic SQL); every whitelisted sort column is index-backed (`(ProjectId, IsDeleted) INCLUDE (…)` for the common path).
- `Update` — full-row update; `@RowVer BIGINT` optimistic concurrency (`50002 CONFLICT` on mismatch, `50001` when gone); Before/After JSON audit in-transaction; returns the updated row.
- `Delete` — soft delete (`IsDeleted/DeletedAtUtc/DeletedBy`); same concurrency contract; BeforeJson audit.

**Business procs** (ports of the Access queries, `docs/source/analysis/access-database.md` §5):

| Proc | Source / purpose |
|---|---|
| `usp_Project_Search @Prefix` | type-ahead project search (req 0.2, checklist row 5) |
| `usp_Todo_GetUpcomingAlerts` | port of `qryUpcomingAlerts` — overdue / due-in-2-days, excluding Completed/Cancelled, with the original AlertType classification |
| `usp_Meeting_GetParticipants @MeetingId` | port of `qryMeetingParticipants` (stakeholder display names + apology flag) |
| `usp_Meeting_GetAttendees @MeetingId` | port of `qryMeetingAttendees` (`IsApology = 0`) |
| `usp_Meeting_GetApologies @MeetingId` | port of `qryMeetingApologies` (`IsApology = 1`) |
| `usp_KeyDeliverable_GanttData @ProjectId` | Gantt source rows (checklist row 67): deliverables + deadlines + assignee + project window |
| `usp_Financial_GetDocumentChecklist @FinancialId` | the 9-type MSSS document checklist with junction state (`qryFinancialsExtended` chain) |
| `usp_Audit_Insert` | append-only audit helper for app-layer events without a domain transaction (Login/Logout from #4) |

**Foundation procs** (modules #1–#2): `usp_ActivityStatus_{Create,List}`, `usp_ViewPreference_{Get,Set}`.

Error registry (ADR-0012): 50001 `NOT_FOUND`, 50002 `CONFLICT`, 50003 `FORBIDDEN_ROW`, 50004 `VALIDATION`, 50005 `DUPLICATE`. Every mutation takes `@ActorUserId`; row-level authorisation activates with module #4.
