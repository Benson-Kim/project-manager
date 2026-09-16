# Project Manager Rebuild — Full Plan

Rebuild of the Access 2010 project-management application as a modern, mobile-first
web app. Source-of-truth requirements: [`docs/source/analysis/`](source/analysis/requirements.md).

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
[source/analysis/access-database.md](source/analysis/access-database.md).

| Access table | New table (schema `app`) | Notes |
|---|---|---|
| tblProjectFramework | `Project` | + `ProjectPriority`, `EstimatedCompletionDate` (checklist add-ons); M:N `ProjectAssignee` (PMs/sponsors/BAs — req 0.3 "one or many") |
| tblStakeholders | `Stakeholder` | FK ProjectId; communication preference & engagement lookups |
| tbl3rdPartySupplier | `Supplier` | full address block, contract dates, rating |
| tblAcronyms | `Keyword` | renamed per checklist §13 (searchable) |
| tblKeyRequirementsDeliverable | `KeyDeliverable` | AssignedTo → FK Stakeholder; drives Gantt |
| tblProjectObjectives | `Objective` | |
| tblMeetingMinutes (recovered — 5 rows), tblMeetingAgenda, tblMeetingDiscussionPoints, tblMeetingActionItems, tblMeetingParticipants | `Meeting`, `MeetingAgendaItem`, `MeetingDiscussionPoint`, `MeetingActionItem`, `MeetingParticipant` | Meeting parent EXISTS in the source (subject, description, location, start date, start/end time, conclusion, next meeting, follow-up); + checklist extras: date received, title, objective, participant list from stakeholders |
| tblInterviewQuestionsAnswers | `QuestionAnswer` | category/priority/assignee |
| tblAssumptionsConstraints | `AssumptionConstraint` | type/impact/status |
| tblRisksIssuesTracker | `RiskIssue` | probability/impact/severity/mitigation; UI merges with assumptions (checklist §16) |
| tblNotes (+attachment) | `Note`, `NoteTab` | rich text (HTML), titled tabs, tables, strikethrough |
| tblITResourcePlanning + Details | `ItResourceCategory`, `ItResourceItem` | categories: Security, Infrastructure, Local Techs, User Training, Interfaces |
| tblFinancials, tblFinancialDocuments (recovered — 9-row lookup), tblProjectFinancialDocuments | `Financial`, `FinancialDocumentType` (lookup seeded from tblFinancialDocuments: DA, DAS, Demande de Signature, Dossier d'opportunité, Appel d'offres, Montage Financier, Réquisition, A1, Signed Direct Contract), `FinancialDocument` (junction: required flag + skip-reason) | MSSS document workflow exactly as in the source |
| tblParkingLotItems | `ParkingLotItem` | strikethrough flag, follow-up actions, date added, owner |
| tblDailyActivityList (+attachment) | `DailyActivity` | status lookup, requester, time spent, assigned-to |
| tblTodoList | `TodoItem`, `TodoAlert` | alert engine: alert day/time, repeat unit/interval, snooze count/max/options, dismissed |
| tblActivityStatusType | `ActivityStatus` (lookup) | Not Started / In Progress / Completed / Cancelled |
| tblExistingSystemsInterfaces | `ExistingSystemInterface` | |
| tblProjectSummary/Task/TaskList/TaskFramework | *(dropped — empty/vestigial)* | recorded in source/analysis |
| — (new) | `auth.User`, `auth.Role`, `auth.LoginAttempt` (delivered by module #4, MR !8 — JWT sessions with a SessionVersion revocation stamp replace `auth.Session`; the role matrix lives in code, so no `UserRole`/`Permission` tables; ADR-0017/ADR-0015) | web multi-user + RBAC |
| — (new) | `audit.AuditLog` | who/what/when/before/after for every mutation |
| — (new) | `app.FileAttachment` | replaces Access attachment columns; content-hash versioning |

Seeds: all rows in `source/analysis/access-database.md` §4 are converted to
`db/seed/*.sql` INSERT scripts (18 projects, 8 stakeholders, 12 suppliers, 29
keywords, 8 deliverables, 6 objectives, 5 meetings + children, 12 Q&A,
8 assumptions/constraints, 2 risks, 7 notes, 15+18 resource-planning rows,
2 financials + 9 document types + 9 junction rows, 12 parking-lot items,
13 daily activities, 16 to-dos + 4 alerts) — idempotent, original IDs preserved
via `IDENTITY_INSERT` (delivered by module #3; proc catalogue in `db/README.md`).

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
| 16 | file-storage-and-backup (uploads + scheduled backups + tested restore) | `feature/file-storage-and-backup` | 2 |
| 17 | financials (MSSS document workflow + uploads) | `feature/financials` | 4, 16 |
| 18 | parking-lot | `feature/parking-lot` | 4 |
| 19 | daily-activities | `feature/daily-activities` | 4 |
| 20 | todo-alerts (dynamic to-do, pop-up alerts, snooze, calendar) | `feature/todo-alerts` | 19 |
| 21 | reports (printable/downloadable, dynamic builder) | `feature/reports` | 4–20 |
| 22 | admin-management (users/roles/permissions/audit viewer/backup status/settings) | `feature/admin-management` | 3, 16 |
| 23 | ci-cd-and-security-automation (Renovate schedule live, scans, audit-fix schedule, hardening) | `feature/ci-cd-and-security-automation` | 1 |

> Ordering fix (review): **file-storage-and-backup now precedes financials**,
> which needs document uploads. Module numbers = build order; issue IIDs are
> mapped in `docs/TRACEABILITY.md` and in epic #1.

MR flow: each `feature/*` → MR to `develop` (staging deploy) → release MR
`develop` → `main` (production, manual deploy). Parallelisable after #4:
stakeholders, suppliers, acronyms, objectives, assumptions-constraints, notes,
it-resource-planning, parking-lot, daily-activities are independent of each
other.

**Phases / milestones**: Phase 1 foundation+db+auth (modules 1–3) · Phase 2
core domain (4–15) · Phase 3 financials/reporting/alerts (16–21, includes
file-storage) · Phase 4 admin/hardening/release (22–23 + release MR).

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
  - `usp_Backup_RecordRun`, `usp_Backup_GetStatus` (admin backup-status panel:
    last run, size, restore-rehearsal result — written by the scheduled job).
  - Recovered queries map to: `qryQuesAns`/`qryProjectfrmQA` → `usp_QuestionAnswer_List`,
    `qryKeyReqDeliverables` → `usp_KeyDeliverable_List`, `qryMeetingParticipants`
    → `usp_Meeting_GetParticipants`, `qryProject3rdPartySupplier` →
    `usp_Supplier_List`, `qryDailyItemsAndStatusType` → `usp_DailyActivity_List`.

## 5. Backup & restore (zero-cost)

- **Scheduled pipeline** (GitLab schedule, e.g. daily): job `backup` runs
  `scripts/backup.sh` against the SQL Server service/host: native
  `BACKUP DATABASE` **full** (daily) + **differential** (each run) +
  **transaction log**, `gzip`, then upload with the CI job token to the
  **GitLab Generic Package Registry** (`project-manager-backups` package,
  version = timestamp) — free, versioned, retained by cleanup policy.
  Job artifacts hold the latest backup as a secondary copy.
- **Uploaded files**: `scripts/backup.sh` tars the uploads volume and ships it in
- Runbook: [`docs/RESTORE-RUNBOOK.md`](RESTORE-RUNBOOK.md) (exists now; extended by the file-storage module).

**RPO / RTO.**
- RPO: ≤ 24 h against a total loss (daily full+diff+log set shipped off-server
  to the package registry); ≤ scheduled interval when running the schedule more
  often (the job is idempotent — run hourly for an RPO of 1 h at zero cost).
  On-server transaction-log backups make point-in-time recovery possible
  between shipped sets.
- RTO: ≤ 30 min — download set + `RESTORE` chain on a fresh SQL Server
  container (rehearsed automatically: `scripts/restore-rehearsal.sh` runs after
  every scheduled backup and fails the pipeline if the chain doesn't restore
  or sanity counts are off).
- Zero-cost justification: GitLab Generic Package Registry + scheduled CI +
  job artifacts are all included in the free tier; SQL Server Developer/Express
  images are free; no external storage or backup service is used. Retention
  pruning (`BACKUP_RETAIN_DAYS`, default 30) keeps registry usage bounded.d versioning.
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

## 8. CI/CD & automation

Stages: `lint` → `typecheck` → `test` → `build` → `security` → `backup`
(scheduled only) → `deploy-staging` (develop) → `deploy-prod` (main, manual).
Feature branches run lint/typecheck/test/build (+ manual e2e); develop/main add
automatic e2e + SAST + Secret Detection + Dependency Scanning (lockfile-based).
Manual utility jobs: `verify:sources` (re-verify the extraction),
`lockfile:generate`.

**Dependency & vulnerability automation (all zero-cost):**

| Mechanism | Trigger | What it does |
|---|---|---|
| Renovate (self-hosted) | pipeline schedule `SCHEDULE_JOB=renovate` (weekly) | `renovate/renovate` image runs against this project (config `renovate.json`, base branch `develop`): MRs for updates, automerge minor/patch, `vulnerabilityAlerts` + `osvVulnerabilityAlerts` open security MRs, lock-file maintenance. Requires `RENOVATE_TOKEN` (project access token: `api`, `write_repository`). |
| `npm-audit-fix` | pipeline schedule `SCHEDULE_JOB=audit` (daily) | runs `npm audit fix`; when something changed, pushes `duo/update/audit-fix-<date>` and opens an MR to develop. Requires `PROJECT_TOKEN`. |
| Dependency Scanning / SAST / Secret Detection | every develop/main pipeline | GitLab templates; findings appear in the security report. |
| `dependency-update` Duo flow | manual/scheduled flow trigger | agent session that also handles majors with release-note reading (`.gitlab/duo/flows/dependency-update.yaml`). |

## 9. Roles & permissions matrix

Roles: **Admin** ▸ **ProjectManager (PM)** ▸ **Contributor** ▸ **Viewer**.
Enforced in three layers: route guard (proxy + layout), server-action guard,
and proc-level `@ActorUserId` permission check. All mutations audit-logged.

| Capability | Admin | PM | Contributor | Viewer |
|---|---|---|---|---|
| View all modules & reports | ✔ | ✔ | ✔ | ✔ |
| Export/print/download reports | ✔ | ✔ | ✔ | ✔ |
| CRUD on own projects (all domain modules) | ✔ | ✔ | ✖ | ✖ |
| CRUD on assigned module records | ✔ | ✔ | ✔ | ✖ |
| Manage project assignees (PMs/sponsors/BAs) | ✔ | ✔ | ✖ | ✖ |
| Upload/delete file attachments | ✔ | ✔ | ✔ | ✖ |
| Manage users, roles, permissions | ✔ | ✖ | ✖ | ✖ |
| View audit log / backup status | ✔ | ✖ | ✖ | ✖ |
| Trigger backup / restore runbook actions | ✔ | ✖ | ✖ | ✖ |
| Application settings | ✔ | ✖ | ✖ | ✖ |

Full security design: [`docs/SECURITY.md`](SECURITY.md).

## 10. Execution plan — one agent session per module

Every module is implemented by launching the **implement-module flow**
(`.gitlab/duo/flows/implement-module.yaml`) — or an interactive agent session —
with the goal text below. Inputs each session MUST read before coding, in
order: `LESSONS.md` (root — mandatory operating rules: commit + push every
~2-3 minutes, push before long jobs, resume protocol with STATUS notes on the
issue, review-before-continuing, environment gotchas; append what you learn),
`AGENTS.md`, `docs/STANDARDS.md` (the constitution), 
`docs/MODULE-BLUEPRINT.md`, the module issue — especially its **Standards
compliance (set by foundation session)** section — this file (§2 §4 §10),
`docs/TRACEABILITY.md`, `docs/source/analysis/` (requirements + the module's
tables/queries/rows) and `docs/adr/`. Each session operates at full breadth —
architect, security engineer, UX designer, accessibility specialist, DBA and
tech lead at once — decides from first principles, records decisions (ADR) and
lands complete work: code + tests + docs + green pipeline.

**Goal text template** (replace placeholders):

> Implement module `<module-key>` (issue `#<iid>`) of the Project Manager
> rebuild. Bring the full breadth of an expert architect, security engineer,
> UX designer, accessibility specialist, DBA and tech lead. Read FIRST, in
> order: LESSONS.md (root — mandatory operating rules; comply with ALL of
> them: commit AND push every ~2-3 minutes or after every file edit with
> "[skip ci]", push before long-running commands, follow the resume protocol
> with dated STATUS notes on issue `#<iid>` after every push and at every
> milestone, review a predecessor's pushed diff before continuing, and append
> what you learn), AGENTS.md, docs/STANDARDS.md, docs/MODULE-BLUEPRINT.md,
> issue `#<iid>` (especially its "Standards compliance (set by foundation
> session)" section), docs/PLAN.md §2/§4/§10, docs/TRACEABILITY.md,
> docs/source/analysis/ for this module's tables/queries/rows, and docs/adr/.
> Create branch `feature/<module-key>` from develop and implement per the
> blueprint: migrations + stored procedures (ADR-0016 list contract, ADR-0012
> errors, audit in-transaction) + seeds + module slice
> (schemas/repository/queries/actions/components) + DataView list + decided
> detail/edit pattern + tests (Vitest; Playwright happy path, validation
> failure, RBAC denial, axe). Comply with every rule in docs/STANDARDS.md —
> deviations require a superseding ADR merged first. Verify
> lint/typecheck/test/build (via CI if the workspace proxy blocks npm; final
> commit message includes "[e2e]"), and open a draft MR to develop titled
> "Draft: feat(<module-key>): …" with "Closes #<iid>" using the Module.md
> template. Wait for the pipeline, fix failures, un-draft when green.

Per-module outputs & verification (all modules): branch `feature/<module>`;
draft MR → develop; `db/migrations/NNN_*.sql` + `db/procs/<entity>/*` +
`db/seed/*`; `src/lib/repositories/<entity>.ts`; `src/app/(app)/<module>/`
screens (mobile-first, 360 px-first); Vitest + Playwright tests; green
pipeline. **Merge gate**: pipeline green (incl. proc-only guardrail), review
notes resolved, acceptance criteria checked off in the issue, un-draft, merge
to develop, verify staging deploy job, close issue.

| Order | Module key (issue) | Session goal specifics beyond template |
|---|---|---|
| 2 | database-schema-and-procs (#3) | All §2 tables + FKs + indexes; CRUD procs per entity; ALL seeds from access-database.md §4 (incl. 5 meetings, 9 document types); `usp_Project_Search`; import mechanism = seeds (checklist row 61) |
| 3 | auth-and-rbac (#4) | auth.User/Role/UserRole/Session tables + procs; Auth.js credentials + bcrypt/argon2; role guards; login rate limiting; seed admin user (forced password change); audit Login/Logout — **delivered, MR !8**: migration 004 (`auth.Role`/`User`/`LoginAttempt`), 12 procs, Auth.js v5 + argon2id, JWT + SessionVersion revocation (ADR-0017), IP rate limit + lockout, seeded admin (hash from `SEED_ADMIN_PASSWORD` at seed time), Login/Logout audit in-proc; e2e RBAC-denial spec deferred to #26, full SecLists denylist to #27 |
| 4 | projects (#5) | charter screen, type-ahead search (row 5), M:N assignees (row 6), add-ons (row 69: priority, est. completion, phase, risk level, status) |
| 5 | stakeholders (#6) | CRUD + comm-preference/engagement dropdowns (row 70) — **delivered, MR !11**: migration 006 (vocab CHECK constraints), `usp_Stakeholder_List` + `@EngagementLevel` filter/EmailAddress search/ProjectRole sort, `/stakeholders` DataView + URL-synced sheet (ADR-0010), charter deep link |
| 6 | suppliers (#7) | CRUD + contact/contract/rating + address block (rows 55, 74) |
| 7 | acronyms (#8) | rename Keywords + search field (row 58) |
| 8 | key-deliverables (#9) | CRUD + deadline/assignee/priority/status (row 71) + Gantt from deliverable dates (row 67) |
| 9 | objectives (#10) | CRUD (row 11) |
| 10 | meetings (#11) | Meeting parent + agenda/discussion/actions/participants; participants picker from stakeholders (rows 13, 53, 54, 72); attendees vs apologies |
| 11 | questions-answers (#12) | CRUD + category/priority/assignee (row 73) |
| 12 | assumptions-constraints (#13) | CRUD + type/impact/mitigation (row 75) |
| 13 | risks-issues (#14) | full tracker fields (row 38); UI merged with assumptions (§16 of checklist) |
| 14 | notes (#15) | Word-like editor: tables, titled tabs, bold/italic/bullets/strikethrough/fonts (rows 17–20, 56, 62) |
| 15 | it-resource-planning (#16) | 5 categories + detail lines + needed flag (PPTX slide 1, rows 21–22) |
| 16 | file-storage-and-backup (#22) | app.FileAttachment + uploads volume; extend backup to uploads; RESTORE-RUNBOOK finalised; storage-location field (row 44) |
| 17 | financials (#17) | budget fields per PPTX slide 2; 9 document types checklist + skip-reasons; attachments (rows 23–24, 64) |
| 18 | parking-lot (#18) | strikethrough, follow-up, date added, owner (rows 25–30; PPTX slide 3) |
| 19 | daily-activities (#19) | CRUD + time spent/assigned/task type/progress (rows 34–35, 76) |
| 20 | todo-alerts (#20) | dynamic to-do from daily activities, ordering, filters, pop-up alerts w/ date+time, repeat unit/interval, snooze options, calendar reminders (rows 31–33, 57, 59, 66) |
| 21 | reports (#21) | printable + downloadable reports over every module, detailed project report, dynamic report builder (rows 36–37, 49) |
| 22 | admin-management (#23) | users/roles UI, audit viewer, backup status (usp_Backup_GetStatus), settings |
| 23 | ci-cd-and-security-automation (#24) | schedules live (backup/audit/renovate), protected branches confirmed, security-scan triage, deploy targets |

## 11. Release, schedules & branch protection

**Release develop → main:** open MR `develop` → `main` titled
`release: <date>`; gate = green develop pipeline + staging verification
(smoke checklist in the MR) + all phase issues closed; merge (no squash);
`deploy-prod` is a manual job on the main pipeline; tag `vX.Y.Z`.
Rollback = revert MR on main + redeploy; DB rollback per RESTORE-RUNBOOK.

**Pipeline schedules to create** (CI/CD ▸ Schedules):

| Schedule | Cron (example) | Variable | Also requires (CI/CD variables) |
|---|---|---|---|
| Nightly backup + restore rehearsal | `0 3 * * *` | `SCHEDULE_JOB=backup` | `MSSQL_SA_PASSWORD` (masked); later `DB_SERVER`/`DB_*` of the real host; optional `GITLAB_TOKEN` for pruning, `BACKUP_RETAIN_DAYS` |
| Daily npm audit fix | `0 5 * * *` | `SCHEDULE_JOB=audit` | `PROJECT_TOKEN` (project access token: api + write_repository) |
| Weekly Renovate | `0 6 * * 1` | `SCHEDULE_JOB=renovate` | `RENOVATE_TOKEN` (api + write_repository), optional `GITHUB_COM_TOKEN` |

Other CI/CD variables: `AUTH_SECRET` (masked, from module 3 onward).
**Never commit secrets** — Secret Detection blocks leaks on develop/main.

**Protected branches (Settings ▸ Repository ▸ Protected branches):**
- `main`: allowed to push **No one**, allowed to merge Maintainers,
  "Allowed to force push" off; require green pipeline to merge.
- `develop`: allowed to push **No one** (MRs only), allowed to merge
  Developers+Maintainers; require green pipeline.
- Optional: pipeline "skipped pipelines are not considered successful",
  and resolve-all-threads required for merge.
