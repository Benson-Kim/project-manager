# AGENTS.md — Project Manager rebuild

Context for agent sessions working in this repository. Read `docs/PLAN.md` for the
full plan and `docs/source-analysis/` for the extracted source-of-truth requirements.

## What this project is

A rebuild of a single-user Microsoft Access project-management application
(`Access_database.mdb` — **never delete the three binary source files** at the repo
root) as a modern, mobile-first web application for tracking IT projects:
charter/framework, stakeholders, suppliers, meetings & minutes, financials
(Quebec MSSS document workflow: DO/DA/DAS/A1/Appel d'Offres), IT resource planning,
risks & issues, parking-lot items, daily activities, to-do list with alerts, notes,
and printable reports.

## Architecture

- **Next.js (latest stable, App Router, TypeScript)** — UI + API in one app.
  Server Actions for mutations, Route Handlers for report downloads/webhooks.
- **Tailwind CSS (latest)** — mobile-first; design starts at small breakpoints;
  touch-friendly targets; PWA manifest.
- **SQL Server 2022** (`mcr.microsoft.com/mssql/server:2022-latest` in Docker).
- **Stored procedures ONLY** for data access — no inline SQL, no ORM. The app uses
  the `mssql` npm package through a thin repository layer (`src/lib/repositories/*`)
  that calls procs with typed, parameterised inputs.
- **Auth.js (NextAuth)** credentials + RBAC (`Admin`, `ProjectManager`,
  `Contributor`, `Viewer`), argon2/bcrypt hashing, zod validation everywhere,
  rate limiting, CSP/HSTS headers, audit-log tables + procs.
- **Backups**: scheduled CI job runs native `BACKUP DATABASE` (full + diff + log),
  compresses and uploads to the GitLab Generic Package Registry (free). Restore
  scripts in `scripts/`, runbook in `docs/RESTORE-RUNBOOK.md`.

## Repository layout

```
db/migrations/    NNN_description.sql — idempotent DDL (tables, FKs, indexes)
db/procs/         one folder per entity; usp_<Entity>_<Action>.sql
db/seed/          data migrated from the Access DB (see docs/source-analysis)
src/app/          Next.js App Router
src/lib/db.ts     shared mssql connection pool
src/lib/repositories/  proc-calling repository layer (the ONLY DB gateway)
scripts/          db-apply.sh, backup.sh, restore.sh, restore-files.sh
tools/mdb/        pure-Python extractors used to read the original Access file
docs/             PLAN.md, source-analysis/, runbooks
.gitlab/duo/      agent config + flow definitions
```

## Conventions

- **Branching**: `main` = production, `develop` = staging. Every module lives on
  `feature/<module-name>` cut from `develop`, MR back to `develop`. Releases:
  `develop` → `main` via release MR. Maintenance branches: `duo/<type>/<desc>`.
- **Commits**: conventional commits (`feat(scope): …`, `fix: …`, `docs: …`).
- **Stored procs**: `usp_<Entity>_<Action>` (Create/GetById/List/Update/Delete +
  business ops). Every proc validates inputs and writes to `audit.AuditLog` on
  mutation. Migrations and proc scripts must be re-runnable (`CREATE OR ALTER`).
- **Never commit secrets.** Secrets live in GitLab CI/CD variables; the repo has
  `.env.example` only.
- **Verification**: `npm run lint && npm run typecheck && npm run test &&
  npm run build` must pass before any MR is opened; CI must be green.
  Note: the DAP workspace proxy blocks npmjs.org — if installs fail locally, push
  and let CI verify, and say so explicitly in the MR.
- **Quality**: mutations RBAC-guarded + audit-logged; all inputs zod-validated;
  UI responsive from 360 px up; Playwright smoke test per module.

## Modules (issue per module; see docs/PLAN.md §3 for ordering/dependencies)

foundation · auth-and-rbac · database-schema-and-procs · projects · stakeholders ·
suppliers · acronyms · key-deliverables · objectives · meetings ·
questions-answers · assumptions-constraints · risks-issues · notes ·
it-resource-planning · financials · parking-lot · daily-activities · todo-alerts ·
reports · file-storage-and-backup · admin-management ·
ci-cd-and-security-automation
