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
| 002 | `app.ViewPreference`  |
| 003 | Full domain schema (module #3): 26 entity tables per STANDARDS §2.2 + `app.FinancialDocumentType` lookup. See the header of `003_domain_schema.sql` for the recorded structural decisions (TodoItem/TodoAlert split, FinancialDocument junction, MeetingParticipant surrogate PK, ProjectAssignee, TIME(0) mapping, dropped attachment refs). |
| 004 | Auth schema (module #4, ADR-0017): `auth.Role` lookup, `auth.User` (§2.2 cols + `SessionVersion` revocation stamp, lockout counters, filtered-unique `Username`), `auth.LoginAttempt` per-IP fixed-window counters, deferred FK `app.ViewPreference.UserId → auth.User`. |
| 005 | Projects refinements (module #5): `app.Project` gains the remaining checklist row-69 add-ons `ProjectStatus`/`ProjectPhase`/`RiskLevel` (NVARCHAR(50) NULL) + filtered index `IX_Project_Status_Priority`. `usp_Project_{Create,GetById,List,Update}` altered in place for the new columns; `usp_Project_List` gains `@Status`/`@Priority` filters, Mandate search and an extended sort whitelist. |
| 017 | Per-project access levels (S1, ADR-0021): `auth.AccessLevel` (Viewer 1 · Contributor 2 · Manager 3); `app.ProjectAssignee.AccessLevel` (FK, backfilled from the linked user's former global role, else from the title) + `FK_ProjectAssignee_User` (orphan UserIds nulled first) + `IX_ProjectAssignee_Access`; titles gain TeamMember/Stakeholder; global roles collapse to Admin/User (moved users get a `SessionVersion` bump); drops `usp_ProjectAssignee_{Create,GetById,Update,Delete}` (`usp_ProjectAssignee_Set` is the only write path). |
| 018 | Managed dropdown lists (ADR-0022): `app.LookupList` (whole-list `RowVer`) + `app.LookupOption` (Label ≤ 50, SortOrder, IsLocked, soft delete, filtered unique `(ListKey, Label)`), 18 lists seeded; `app.ActivityStatus` folded into `daily-activity.status` (`DailyActivity.ActivityStatusId` re-pointed, table + procs dropped); drops the stakeholder/Q&A vocabulary CHECKs (006/009 superseded). Procs: `db/procs/lookup-list/` (GetOptions, Set with the rename cascade, AssertLabel, AssertOption); inline TVFs `ufn_AccessLevel_Resolve`, `ufn_TodoItem_AccessLevel` filter every list proc, which return `ActorAccess` (ADR-0023). |
| 019 | Datasheet layout (ADR-0023): `app.ViewPreference.Layout` — JSON `{order, widths, rowHeight}` per user per module, CHECK = JSON object; `usp_ViewPreference_Get` returns it, `usp_ViewPreference_SetLayout` stores it (NULL resets). |
| 020 | Option colours (ADR-0022): `app.LookupOption.Color` (palette key: red/orange/yellow/green/blue/purple/gray, CHECK) and `app.LookupList.TintRows` (rows take their value's colour); starting colours for urgent priorities and statuses, only where a list has none. |
| 021 | Per-person permission overrides (ADR-0024): `app.ProjectPermissionOverride` (ProjectId, UserId, Module, Verb create/update/delete, Allowed); team titles become the managed list `project-assignee.title` (codes rewritten to labels, `CK_ProjectAssignee_Role` dropped, "Project manager" locked). Procs: `access-level/usp_Permission_Require` (the write check), `ufn_Permission_Overrides` (per-row grants/revokes for list procs), `project-permission/usp_ProjectPermission_{List,Set}`; every section write proc passes `@Permission`. |
| 006 | Stakeholders refinements (module #6): CHECK constraints for the requirements row-70 dropdown vocabularies — `CommunicationPreference IN (Email, Phone, Meetings)`, `EngagementLevel IN (High, Medium, Low)`, NULL allowed (CHECK over lookup tables: fixed short lists, no admin editing). `usp_Stakeholder_List` altered in place: gains `@EngagementLevel` filter, `EmailAddress` search and `ProjectRole` in the sort whitelist. |

## Stored-procedure catalogue (after module #3)

**CRUD — 5 procs per entity** (`usp_<Entity>_{Create,GetById,List,Update,Delete}`) for:
Project, ProjectAssignee, Stakeholder, Supplier, Keyword, KeyDeliverable, Objective,
Meeting, MeetingAgendaItem, MeetingDiscussionPoint, MeetingActionItem, MeetingParticipant,
QuestionAnswer, AssumptionConstraint, RiskIssue, Note, NoteTab, ItResourceCategory,
ItResourceItem, Financial, FinancialDocument, ParkingLotItem, DailyActivity, TodoItem,
TodoAlert, ExistingSystemInterface (26 entities, 130 procs). ProjectAssignee keeps only
`List` + `Set` since migration 017.

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
| `usp_ProjectAssignee_Set @ProjectId, @AssigneesJson` | replace a project's full team (req 0.3, ADR-0021) in one transaction — title, linked account and access level per member; Manager only; validates titles, active accounts, levels, duplicates; a non-Admin cannot remove their own Manager access; soft-deletes absentees, revives matches, inserts new; audited |
| `usp_Todo_GetUpcomingAlerts` | port of `qryUpcomingAlerts` — overdue / due-in-2-days, excluding Completed/Cancelled, with the original AlertType classification |
| `usp_Meeting_GetParticipants @MeetingId` | port of `qryMeetingParticipants` (stakeholder display names + apology flag) |
| `usp_Meeting_GetAttendees @MeetingId` | port of `qryMeetingAttendees` (`IsApology = 0`) |
| `usp_Meeting_GetApologies @MeetingId` | port of `qryMeetingApologies` (`IsApology = 1`) |
| `usp_KeyDeliverable_GanttData @ProjectId` | Gantt source rows (checklist row 67): deliverables + deadlines + assignee + CreatedAtUtc (bar start basis, module #9) + project window; `usp_KeyDeliverable_List` additionally filters on `@Status`/`@Priority` (module #9) |
| `usp_Financial_GetDocumentChecklist @FinancialId` | the 9-type MSSS document checklist with junction state (`qryFinancialsExtended` chain) |
| `usp_Audit_Insert` | append-only audit helper for app-layer events without a domain transaction (Login/Logout from #4) |

**Foundation procs** (modules #1–#2): `usp_ActivityStatus_{Create,List}`, `usp_ViewPreference_{Get,Set}`.

**Auth procs** (module #4, ADR-0017 — see the file headers for contracts):

| Proc | Purpose |
|---|---|
| `usp_User_Create` | insert + in-tran audit; `50005 DUPLICATE` on live username; returns row WITHOUT `PasswordHash` |
| `usp_User_GetById` / `usp_User_List` | never return `PasswordHash`; List per ADR-0016 |
| `usp_User_GetByUsername` | credentials lookup — the ONLY proc returning the hash; empty set (no THROW) for unknown users so the login message stays generic |
| `usp_User_Update` | profile/role/state; `50002 CONFLICT` on `@RowVer`; bumps `SessionVersion` when role/active changes |
| `usp_User_Deactivate` | `IsActive = 0` + `SessionVersion` bump (users are deactivated, not soft-deleted — audit attribution survives) |
| `usp_User_SetPassword` | new hash, resets lockout, bumps `SessionVersion`; audit row carries NO hash |
| `usp_User_RecordLoginAttempt` | per-user lockout state machine (backoff 30 s·2^n from 5th failure, cap 30 min) + in-proc `Login`/`LoginFailed` audit |
| `usp_User_BumpSessionVersion` | server-side revocation of all outstanding JWTs |
| `usp_Role_List` | fixed vocabulary lookup (ActivityStatus pattern) |
| `usp_LoginAttempt_Check` / `usp_LoginAttempt_Record` | fixed-window 5/min/IP counters (Record is the atomic increment + self-purge) |
| `usp_User_GetActorRole @UserId, @Role OUTPUT` | the actor's global role from `auth.User`; `50003` for unknown or inactive users (procs never trust a caller-supplied role) |
| `usp_User_ListOptions @ActorUserId, @Search` | team-editor pick-list: active accounts' `UserId` + `DisplayName` only, max 500 |

**Access procs** (S1, ADR-0021 — the single row-level rule; every project-scoped proc calls one):

| Proc | Purpose |
|---|---|
| `usp_Project_ResolveAccess @ProjectId, @ActorUserId, @AllowProjectless, @Level OUTPUT` | the rule: Admin → Manager; project-less → Contributor when allowed; else the highest live assignment level |
| `usp_AccessLevel_Require @Level, @MinLevel` | compares ranks; `50003` when missing or too low; `51000` for an unknown `@MinLevel` (fail closed) |
| `usp_Project_AssertAccess @ProjectId, @ActorUserId, @MinLevel, @AllowProjectless = 0` | ResolveAccess + Require — what entity procs call with a literal `@MinLevel` |
| `usp_Project_GetAccess @ProjectId, @ActorUserId` | returns `AccessLevel` (NULL = none) so pages show only allowed actions |
| `usp_TodoItem_AssertAccess` / `usp_TodoAlert_AssertAccess` | to-dos are personal: owner holds Manager outside projects; anyone else needs Manager in the project |
| `usp_DailyActivity_AssertAccess` | resolves the activity's project (`50001` when gone), project-less allowed |

`src/tests/proc-access-levels.test.ts` fails when a proc's literal `@MinLevel` disagrees with `requiredLevel()` in `src/lib/auth/rbac.ts` or a project-scoped proc stops checking access.

Seeds 026–029: roles (Admin, User), admin (hash injected at seed time by `scripts/db-apply.sh` from `SEED_ADMIN_PASSWORD` — nothing committed), e2e users and their project-2 team — e2e-pm Manager, e2e-contributor Contributor, e2e-viewer Viewer (only with `E2E_SEED=1`).

Error registry (ADR-0012): 50001 `NOT_FOUND`, 50002 `CONFLICT`, 50003 `FORBIDDEN_ROW`, 50004 `VALIDATION`, 50005 `DUPLICATE`. Every proc takes `@ActorUserId` and no role; row-level authorisation is per project access level (ADR-0021).
