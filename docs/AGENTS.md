# AGENTS.md — Project Manager rebuild (operating manual for agent sessions)

**Read order for EVERY session**: `LESSONS.md` (root — mandatory operating rules:
commit-and-push cadence, resume protocol, review-before-continuing, environment
gotchas; append what you learn) → this file → `docs/STANDARDS.md` (the constitution —
every rule you must comply with) → `docs/MODULE-BLUEPRINT.md` (the recipe) → your
issue's **Standards compliance** section → `docs/PLAN.md` §2/§4/§10 →
`docs/source/analysis/` for your module's tables/queries/rows. ADRs in `docs/adr/`
record why; you may supersede an ADR only with a new ADR, never silently.

Operate at full breadth: you are simultaneously the architect, security engineer, UX
designer, accessibility specialist, DBA and tech lead. Read the whole relevant surface
before coding, decide from first principles, record decisions, then land complete
work — code + tests + docs + green pipeline. No placeholders unless tracked in an
issue.

## What this project is

A rebuild of a single-user Microsoft Access project-management application
(`docs/source/Access_database.mdb` — **never delete or modify the three binary source
files** in `docs/source/`) as a modern, mobile-first web application for tracking IT
projects:
charter/framework, stakeholders, suppliers, meetings & minutes, financials (Quebec
MSSS document workflow: DO/DA/DAS/A1/Appel d'Offres), IT resource planning, risks &
issues, parking-lot items, daily activities, to-do list with alerts, notes, and
printable reports.

## Architecture (details + rationale in docs/STANDARDS.md and docs/adr/)

- **Next.js 16 (App Router, TypeScript)** — Server Components by default, Server
  Actions for all mutations via the `action()` wrapper (`src/lib/action.ts`:
  zod → auth → RBAC → execute → audit → `ActionResult`; never throw to the client).
  Route Handlers only for downloads/webhooks/auth. Per-request nonce CSP lives in
  `src/proxy.ts` (Next 16 renamed middleware — do not add a `middleware.ts`).
- **Feature-sliced modules**: `src/modules/<module>/{actions,components,schemas,repository,queries}`;
  thin routes in `src/app/(app)/<module>/`; shared primitives in
  `src/components/ui/` (DataView, Sheet/Dialog, Form, Toaster, …) — compose them,
  never fork them.
- **Tailwind CSS 4** — semantic `@theme` tokens in `src/app/globals.css`; mobile-first
  from 360 px; 44 px touch targets; dark mode `html[data-theme]`; PWA.
- **SQL Server 2022**, **stored procedures ONLY** — no inline SQL, no ORM. The single
  gateway is `src/lib/db.ts` (`execProc`); enforced by ESLint and guardrail tests.
  Soft delete + `ROWVERSION` concurrency + audit columns on every entity; list procs
  follow the ADR-0016 contract; errors via the THROW registry (ADR-0012).
- **Auth.js RBAC** (`Admin`, `ProjectManager`, `Contributor`, `Viewer`) — contract in
  `src/lib/auth/` (stub until module #4; interface is final). Every mutation is
  RBAC-guarded and audit-logged (`audit.AuditLog`, written by the proc).
- **Backups**: scheduled CI `BACKUP DATABASE` → GitLab Generic Package Registry, with
  restore rehearsal. Runbook: `docs/RESTORE-RUNBOOK.md`.

## Repository layout

```
db/migrations/    NNN_description.sql — applied once, tracked in app.SchemaMigrations
db/procs/         one folder per entity; usp_<Entity>_<Verb>.sql (CREATE OR ALTER)
db/seed/          data migrated from the Access DB (docs/source/analysis §4 only)
src/app/          App Router routes (thin) + globals.css tokens
src/modules/      feature slices (actions/components/schemas/repository/queries)
src/components/   ui/ (shared primitives), shell/ (nav, header)
src/lib/          db.ts, action.ts, auth/, messages.ts, list-params.ts, env.ts
scripts/          db-apply.sh, backup.sh, restore*.sh
docs/             STANDARDS.md, MODULE-BLUEPRINT.md, adr/, PLAN.md, source/ (binaries + analysis/)
.gitlab/duo/      agent config + flow definitions
```

## Working rules

- **Branching**: `main` = production, `develop` = staging. Modules:
  `feature/<module-key>` from `develop`, MR back to `develop` using the `Module.md` MR
  template, `Closes #<iid>`. Maintenance: `duo/<type>/<desc>`.
- **Commits**: Conventional Commits. CI opt-ins via commit message: `[e2e]` runs the
  Playwright suite on a feature branch; `[lockfile]` refreshes `package-lock.json`
  (commit the job's artifact).
- **Verification**: `npm run lint && npm run typecheck && npm run test && npm run
  build` green before un-drafting; module MRs also need a green `[e2e]` run. The DAP
  workspace proxy **blocks npmjs.org** — when local installs fail, push and let CI
  verify, and say so explicitly in the MR. Dependency versions are verified via the
  `lockfile:generate` job's report (`npm outdated`), not locally.
- **Dependencies**: `package-lock.json` is committed — always `npm ci`. Adding a
  runtime dependency requires an ADR (see ADR-0014 policy).
- **Never commit secrets** (CI/CD variables only). Never touch the three binary
  artefacts. Never re-parse them ad hoc — `docs/source/analysis/` is the verified
  source of truth; seeds come from its §4.
- **Quality gates**: stored-proc-only guardrails; zod at every boundary; RBAC + audit
  on every mutation; DataView for every list; no hints/helper text/tooltips in the UI;
  WCAG 2.2 AA with axe checks; copy only in `src/lib/messages.ts`; coverage ≥ 80 % on
  `src/modules/**` and `src/lib/**`. Full Definition of Done: STANDARDS.md §12.

## Modules (issue per module; see docs/PLAN.md §3 for ordering/dependencies)

foundation · database-schema-and-procs · auth-and-rbac · projects · stakeholders ·
suppliers · keywords · key-deliverables · objectives · meetings ·
questions-answers · assumptions-constraints · risks-issues · notes ·
it-resource-planning · financials · parking-lot · daily-activities · todo-alerts ·
reports · file-storage-and-backup · admin-management · ci-cd-and-security-automation
