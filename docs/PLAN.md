# Project Manager Rebuild — Full Plan

Rebuild of the Access 2010 project-management application as a modern, mobile-first
web app. Source-of-truth requirements: [`docs/source-analysis/`](source-analysis/requirements.md).

## 1. Architecture

```
┌────────────────────────── Browser / PWA (mobile-first) ─────────────────────────┐
│ Next.js App Router pages · Tailwind CSS · touch-friendly components · manifest  │
└───────────────▲──────────────────────────────────────────────▲─────────────────┘
                │ Server Actions (mutations)                    │ Route Handlers
┌───────────────┴──────────────────────────────────────────────┴─────────────────┐
│ Next.js server (TypeScript)                                                     │
│  Auth.js (credentials, sessions, CSRF) · RBAC middleware · zod validation       │
│  rate limiting · security headers (CSP/HSTS) · audit logging                    │
│  src/lib/repositories/* — the ONLY database gateway                             │
└───────────────▲─────────────────────────────────────────────────────────────────┘
                │ `mssql` (tedious) — parameterised EXEC of stored procedures ONLY
┌───────────────┴─────────────────────────────────────────────────────────────────┐
│ SQL Server 2022 (Docker: mcr.microsoft.com/mssql/server:2022-latest)            │
│  schemas: app (tables) · usp procs (CRUD + business logic) · audit (AuditLog)   │
│  migrations db/migrations · procs db/procs · seeds db/seed (from Access data)   │
└───────────────▲─────────────────────────────────────────────────────────────────┘
                │ scheduled CI: BACKUP DATABASE full/diff/log → gzip →
                │ GitLab Generic Package Registry (zero-cost) + restore scripts
```

- **Framework**: Next.js latest stable (App Router, TypeScript, Server Actions,
  Route Handlers). *The workspace proxy blocks the npm registry, so exact "latest"
  is resolved at install time in CI — package.json pins current major with caret
  ranges and Renovate keeps everything on latest.*
- **Styling**: Tailwind CSS latest, mobile-first breakpoints, PWA manifest.
- **Data access**: stored procedures only, via `mssql` npm package and a thin
  repository layer. No inline SQL, no ORM.
- **Files/uploads**: stored on a Docker volume locally; backed up + versioned via
  the same scheduled backup job to the Generic Package Registry (free tier only).

## 2. Data model — Access → SQL Server mapping

Type mapping: `LONG→INT (IDENTITY for PKs)`, `TEXT(255)→NVARCHAR(255)`,
`MEMO→NVARCHAR(MAX)`, `DATETIME→DATETIME2`, `BOOL→BIT`, `DOUBLE→FLOAT`,
`MONEY→MONEY`, attachments → `app.FileAttachment` + module link tables.
Column names are normalised to PascalCase without spaces (e.g. `Contact Person` →
`ContactPerson`); original names documented in
[source-analysis/access-database.md](source-analysis/access-database.md).

| Access table | New table (schema `app`) | Notes |
|---|---|---|
| tblProjectFramework | `Project` | + `ProjectPriority`, `EstimatedCompletionDate` (checklist add-ons); M:N `ProjectAssignee` (PMs/sponsors/BAs — req 0.3 "one or many") |
| tblStakeholders | `Stakeholder` | FK ProjectId; communication preference & engagement lookups |
| tbl3rdPartySupplier | `Supplier` | full address block, contract dates, rating |
| tblAcronyms | `Keyword` | renamed per checklist §13 (searchable) |
| tblKeyRequirementsDeliverable | `KeyDeliverable` | AssignedTo → FK Stakeholder; drives Gantt |
| tblProjectObjectives | `Objective` | |
| (orphan) tblMeetingMinutes, tblMeetingAgenda, tblMeetingDiscussionPoints, tblMeetingActionItems, tblMeetingParticipants | `Meeting`, `MeetingAgendaItem`, `MeetingDiscussionPoint`, `MeetingActionItem`, `MeetingParticipant` | re-instated Meeting parent; location/agenda/start/end fields; attended vs apologies flag |
| tblInterviewQuestionsAnswers | `QuestionAnswer` | category/priority/assignee |
| tblAssumptionsConstraints | `AssumptionConstraint` | type/impact/status |
| tblRisksIssuesTracker | `RiskIssue` | probability/impact/severity/mitigation; UI merges with assumptions (checklist §16) |
| tblNotes (+attachment) | `Note`, `NoteTab` | rich text (HTML), titled tabs, tables, strikethrough |
| tblITResourcePlanning + Details | `ItResourceCategory`, `ItResourceItem` | categories: Security, Infrastructure, Local Techs, User Training, Interfaces |
| tblFinancials, tblProjectFinancialDocuments | `Financial`, `FinancialDocument` | MSSS doc workflow: DO/DA/DAS/A1/AppelDOffres/MontageFinancier/Requisition/DemandeSignature/SignedContract + skip-reason |
| tblParkingLotItems | `ParkingLotItem` | strikethrough flag, follow-up actions, date added, owner |
| tblDailyActivityList (+attachment) | `DailyActivity` | status lookup, requester, time spent, assigned-to |
| tblTodoList | `TodoItem`, `TodoAlert` | alert engine: alert day/time, repeat unit/interval, snooze count/max/options, dismissed |
| tblActivityStatusType | `ActivityStatus` (lookup) | Not Started / In Progress / Completed / Cancelled |
| tblExistingSystemsInterfaces | `ExistingSystemInterface` | |
| tblProjectSummary/Task/TaskList/TaskFramework | *(dropped — empty/vestigial)* | recorded in source-analysis |
| — (new) | `auth.User`, `auth.Role`, `auth.UserRole`, `auth.Permission`, `auth.Session` | web multi-user + RBAC |
| — (new) | `audit.AuditLog` | who/what/when/before/after for every mutation |
| — (new) | `app.FileAttachment` | replaces Access attachment columns; content-hash versioning |

Seeds: all rows in `source-analysis/access-database.md` §4 are converted to
`db/seed/*.sql` INSERT scripts (18 projects, 8 stakeholders, 12 suppliers, 29
keywords, 8 deliverables, 6 objectives, 3 meetings + children, 12 Q&A,
8 assumptions/constraints, 2 risks, 7 notes, 15+18 resource-planning rows,
2 financials + 9 documents, 12 parking-lot items, 13 daily activities, 16 to-dos).

## 3. Modules, branches, ordering & dependencies

| # | Module | Branch | Depends on |
|---|--------|--------|------------|
| 1 | foundation (scaffold, CI, docker-compose, db layer) | `feature/foundation` | — |
| 2 | database-schema-and-procs (all tables + core procs + seeds) | `feature/database-schema-and-procs` | 1 |
| 3 | auth-and-rbac | `feature/auth-and-rbac` | 2 |
| 4 | projects (framework/charter, search, multi-assignee) | `feature/projects` | 3 |
| 5 | stakeholders | `feature/stakeholders` | 4 |
| 6 | suppliers | `feature/suppliers` | 4 |
| 7 | acronyms (keywords + search) | `feature/acronyms` | 4 |
| 8 | key-deliverables (+ Gantt) | `feature/key-deliverables` | 5 |
| 9 | objectives | `feature/objectives` | 4 |
| 10 | meetings (minutes/agenda/discussion/actions/participants) | `feature/meetings` | 5 |
| 11 | questions-answers | `feature/questions-answers` | 5 |
| 12 | assumptions-constraints | `feature/assumptions-constraints` | 4 |
| 13 | risks-issues | `feature/risks-issues` | 12 |
| 14 | notes (rich text, tabs, tables) | `feature/notes` | 4 |
| 15 | it-resource-planning | `feature/it-resource-planning` | 4 |
| 16 | financials (MSSS document workflow + uploads) | `feature/financials` | 4, 21 |
| 17 | parking-lot | `feature/parking-lot` | 4 |
| 18 | daily-activities | `feature/daily-activities` | 4 |
| 19 | todo-alerts (dynamic to-do, pop-up alerts, snooze, calendar) | `feature/todo-alerts` | 18 |
| 20 | reports (printable/downloadable, dynamic builder) | `feature/reports` | 4–19 |
| 21 | file-storage-and-backup (uploads + scheduled backups + restore) | `feature/file-storage-and-backup` | 2 |
| 22 | admin-management (users/roles/permissions/audit viewer/backup status/settings) | `feature/admin-management` | 3, 21 |
| 23 | ci-cd-and-security-automation (Renovate, scans, audit-fix schedule) | `feature/ci-cd-and-security-automation` | 1 |

MR flow: each `feature/*` → MR to `develop` (staging deploy) → release MR
`develop` → `main` (production, manual deploy). Parallelisable after #4:
5–9, 12, 14–18 are independent of each other.

## 4. Stored-procedure catalogue

Naming: `usp_<Entity>_<Action>`; one file per proc in `db/procs/<entity>/`;
`CREATE OR ALTER`; all mutations insert into `audit.AuditLog`.

- **Per entity** (Project, Stakeholder, Supplier, Keyword, KeyDeliverable,
  Objective, Meeting, MeetingAgendaItem, MeetingDiscussionPoint,
  MeetingActionItem, MeetingParticipant, QuestionAnswer, AssumptionConstraint,
  RiskIssue, Note, NoteTab, ItResourceCategory, ItResourceItem, Financial,
  FinancialDocument, ParkingLotItem, DailyActivity, TodoItem,
  ExistingSystemInterface, FileAttachment):
  `Create`, `GetById`, `List` (paged/filtered by ProjectId), `Update`, `Delete`.
- **Business logic** (from Access queries/modules):
  - `usp_Project_Search @Prefix` — type-ahead search (req 0.2).
  - `usp_Todo_GetUpcomingAlerts` — port of `qryUpcomingAlerts` (overdue /
    due-in-2-days, excluding Completed/Cancelled).
  - `usp_Todo_Snooze`, `usp_Todo_Dismiss`, `usp_Todo_BuildFromDailyActivity`
    (checklist §13.1), `usp_Todo_Reorder`.
  - `usp_Meeting_GetAttendees`, `usp_Meeting_GetApologies` (qryMeetingAttendees/Apologies).
  - `usp_Report_DetailedProject @ProjectId`, `usp_Report_Dynamic` (report builder
    input), one `usp_Report_<Module>` per module report (ports of qry*).
  - `usp_Financial_GetDocumentChecklist`, `usp_KeyDeliverable_GanttData`.
  - `usp_Audit_Insert`, `usp_Audit_Search` (admin viewer).
  - `usp_User_*`, `usp_Role_*`, `usp_Permission_*`, `usp_Session_*` (auth).

## 5. Backup & restore (zero-cost)

- **Scheduled pipeline** (GitLab schedule, e.g. daily): job `backup` runs
  `scripts/backup.sh` against the SQL Server service/host: native
  `BACKUP DATABASE` **full** (daily) + **differential** (each run) +
  **transaction log**, `gzip`, then upload with the CI job token to the
  **GitLab Generic Package Registry** (`project-manager-backups` package,
  version = timestamp) — free, versioned, retained by cleanup policy.
  Job artifacts hold the latest backup as a secondary copy.
- **Uploaded files**: `scripts/backup.sh` tars the uploads volume and ships it in
  the same package version; content-hash naming gives deduped versioning.
- **Restore**: `scripts/restore.sh <version>` downloads the package, restores
  full+diff+log with `RESTORE DATABASE … WITH NORECOVERY/RECOVERY`;
  `scripts/restore-files.sh <version>` restores the uploads volume. A **restore
  rehearsal job** (manual, plus on schedule) restores into a scratch container and
  runs row-count assertions — backups are only real if restores are tested.
- Runbook: `docs/RESTORE-RUNBOOK.md` (created in module 21).

## 6. Security design

- Auth.js credentials provider; argon2id password hashing; DB-backed sessions;
  CSRF protection (built-in for Server Actions + same-site cookies).
- RBAC: `Admin`, `ProjectManager`, `Contributor`, `Viewer`; permission checks in
  middleware + per-server-action guard + proc-level `@ActorUserId` validation.
- Input validation with zod at every boundary; parameterised proc calls only
  (no string SQL); output encoding via React.
- Rate limiting on auth + mutation endpoints; login lockout with backoff.
- Security headers: CSP (nonce-based), HSTS, X-Frame-Options DENY,
  Referrer-Policy, Permissions-Policy.
- Audit: `audit.AuditLog` (actor, action, entity, entity id, before/after JSON,
  timestamp, IP) written by every mutating proc; admin viewer UI.
- Secrets only in GitLab CI/CD variables (`MSSQL_SA_PASSWORD`, `DB_APP_PASSWORD`,
  `AUTH_SECRET`); repo carries `.env.example` only; Secret-Detection CI blocks leaks.
- GitLab CI templates: SAST, Dependency Scanning, Secret Detection; Renovate with
  automerge for minor/patch + security updates; scheduled `npm audit fix` flow
  opening MRs (see `.gitlab/duo/flows/dependency-update.yaml`).

## 7. Mobile-first UI plan

- Design from 360 px up: single-column cards → `md:` two-pane lists →
  `lg:` dashboard grids. Bottom tab bar on mobile, sidebar on desktop.
- Touch targets ≥ 44 px, swipe actions on list rows (complete/snooze to-dos),
  pull-to-refresh on lists, sticky action buttons.
- PWA: manifest + icons + installability; alert notifications for to-do reminders
  (in-app poll of `usp_Todo_GetUpcomingAlerts`, Notification API when granted).
- Word-like rich-text editing (notes, minutes, parking-lot strikethrough) with a
  Tailwind-styled editor component; printable report views via print CSS +
  downloadable exports (checklist "Reports must be downloadable").
- Multi-window: every module screen is deep-linkable so users can open the
  project framework and the daily activity list in separate windows/tabs
  (checklist "Items to remember").

## 8. CI/CD

Stages: `lint` → `typecheck` → `test` → `build` → `security` → `backup`
(scheduled only) → `deploy-staging` (develop) → `deploy-prod` (main, manual).
Feature branches run lint/typecheck/test/build only (rules-based). See
`.gitlab-ci.yml` (foundation module).

## 9. This session's deliverables

1. `docs/source-analysis/*` on `develop` ✔
2. `.gitlab/duo/agent-config.yml`, flows, `AGENTS.md` (this MR)
3. `docs/PLAN.md` (this file)
4. Epic-style parent issue + one issue per module (with acceptance criteria and
   branch names)
5. `feature/foundation` scaffold + MR to `develop`
6. This docs/config MR to `develop`
