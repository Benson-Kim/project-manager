# Project Manager

Mobile-first rebuild of a Microsoft Access project-management application
(charter/framework, stakeholders, suppliers, meetings & minutes, financials,
IT resource planning, risks & issues, parking lot, daily activities, to-do
alerts, notes and reports) as a **Next.js + SQL Server** web app.

- 📋 Plan & architecture: [`docs/PLAN.md`](docs/PLAN.md)
- 🔎 Source-system analysis (full extraction of the original Access DB, Excel
  checklist and mock-up deck): [`docs/source/analysis/`](docs/source/analysis/requirements.md)
- 🤖 Agent conventions: [`AGENTS.md`](AGENTS.md)

## Stack

Next.js (App Router, TypeScript, Server Actions) · Tailwind CSS (mobile-first,
PWA) · SQL Server 2022 · **stored-procedure-only** data access via the `mssql`
package · Auth.js RBAC · Vitest + Playwright · GitHub Actions (CodeQL, Dependabot,
nightly backup rehearsal) · host-run backups ([ADR-0032](docs/adr/ADR-0032-deployment-topology-and-backups.md)).

## Quickstart

```sh
cp .env.example .env          # set strong MSSQL_SA_PASSWORD and DB_APP_PASSWORD (= DB_PASSWORD)
docker compose up -d mssql    # start SQL Server 2022
set -a; . ./.env; set +a      # the scripts read MSSQL_SA_PASSWORD and DB_APP_*
./scripts/db-apply.sh         # migrations + procs + seeds + the app's login (needs sqlcmd)
npm ci
npm run dev                   # http://localhost:3000, connects as pm_web (ADR-0033)
```

Full local stack (app container + DB): `docker compose up --build`.

## Development

| Command | Purpose |
|---|---|
| `npm run lint` / `npm run typecheck` | ESLint / strict TypeScript |
| `npm run test` | Vitest unit tests |
| `npm run e2e` | Playwright smoke tests |
| `npm run build` | Production build (standalone) |
| `./scripts/db-apply.sh` | Apply `db/` migrations, procs, seeds |
| `./scripts/backup.sh` / `restore.sh` / `restore-files.sh` / `restore-rehearsal.sh` | Backup & tested restore (see docs/RESTORE-RUNBOOK.md) |

## Branching

`main` = production · `develop` = staging · one module per `feature/<module>`
branch, MR → `develop`, release MRs `develop` → `main`. Module list and
ordering: [`docs/PLAN.md`](docs/PLAN.md) §3 and the issue board.

> ⚠️ The three binary files in [`docs/source/`](docs/source/) (`Access_database.mdb`,
> `Project_.xlsx`, `Project_hololens.pptx`) are the original source artefacts —
> never delete or modify them.
