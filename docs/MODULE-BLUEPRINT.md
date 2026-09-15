# Module Blueprint — the exact recipe every module session follows

Read order (mandatory, before any code): `LESSONS.md` (root — operating rules:
commit + push every ~2-3 minutes, push before long jobs, resume protocol, STATUS
notes on the issue) → `AGENTS.md` → `docs/STANDARDS.md` →
this file → your issue's **Standards compliance** section → `docs/PLAN.md` §2/§4/§10 →
`docs/source/analysis/requirements.md` + the `access-database.md` sections for your
tables/queries/rows → existing code in `src/components/ui/`, `src/lib/` and one merged
module as reference.

## Steps

1. **Branch** — `git fetch origin && git switch -c feature/<module-key> origin/develop`
   (reuse the branch if it exists).
2. **Design on paper first** — from the source analysis: final table shapes (STANDARDS
   §2.2), the full proc list (CRUD + business verbs + List per ADR-0016), the RBAC
   rows, the card fields/table columns, which detail/edit pattern applies (your issue
   states it). If anything deviates from an ADR, STOP and write a superseding ADR
   first.
3. **Migration** — next `NNN_<module>.sql`: tables + FKs + indexes (list-proc sort
   columns!) + audit cols + `RowVer` + soft delete. Idempotent DDL.
4. **Procs** — one file each under `db/procs/<entity>/`; `CREATE OR ALTER`; mutations
   audit in-transaction; THROW registry (ADR-0012); List proc exactly per ADR-0016.
5. **Seeds** — `db/seed/NNN_<entity>.sql` from `access-database.md` §4, idempotent.
6. **Repository** — `src/modules/<module>/repository/`: `execProc` only, zod-parse
   rows, forward list params 1:1.
7. **Schemas** — `src/modules/<module>/schemas/`: input schemas (create/update with
   `rowVer`), row schema, filter schema extending `listParamsSchema`.
8. **Actions** — `src/modules/<module>/actions/`: one file per mutation via
   `action()` with `permission` + `revalidate`.
9. **List page** — `src/app/(app)/<module>/page.tsx`: parse `searchParams` →
   query → `<DataView>` with your card renderer + columns (+ `loading.tsx`,
   `error.tsx`). Add the module to the shell navigation.
10. **Detail/edit** — Sheet (default) or the decided full route; forms per ADR-0009;
    `ConfirmDialog` for deletes; copy in `messages.ts`.
11. **Tests** — Vitest: schemas, repository (mock `execProc`), action paths.
    Playwright: happy path, validation failure, RBAC denial, axe scan.
12. **Verify** — push and let CI run `lint`/`typecheck`/`test`/`build`; final commit
    message includes `[e2e]`. The workspace proxy blocks npm — CI is the verifier;
    say so in the MR if you could not run locally.
13. **Docs & tracking** — update `docs/TRACEABILITY.md` row; ADRs if any; tick issue
    acceptance criteria.
14. **MR** — draft MR → `develop`, template `Module.md`, title
    `Draft: feat(<module>): <summary>`, `Closes #<iid>`. Watch the pipeline, fix
    failures, un-draft when green, comment on the issue with the delivered checklist.

## File-tree template

```
db/migrations/NNN_<module>.sql
db/procs/<entity>/usp_<Entity>_Create.sql
db/procs/<entity>/usp_<Entity>_GetById.sql
db/procs/<entity>/usp_<Entity>_List.sql
db/procs/<entity>/usp_<Entity>_Update.sql
db/procs/<entity>/usp_<Entity>_Delete.sql
db/seed/NNN_<entity>.sql
src/modules/<module>/schemas/<entity>.ts
src/modules/<module>/repository/<entity>.ts
src/modules/<module>/queries/list-<entities>.ts
src/modules/<module>/queries/get-<entity>.ts
src/modules/<module>/actions/create-<entity>.ts
src/modules/<module>/actions/update-<entity>.ts
src/modules/<module>/actions/delete-<entity>.ts
src/modules/<module>/components/<entity>-card.tsx
src/modules/<module>/components/<entity>-columns.tsx
src/modules/<module>/components/<entity>-form.tsx
src/app/(app)/<module>/page.tsx
src/app/(app)/<module>/loading.tsx
src/app/(app)/<module>/error.tsx
src/modules/<module>/schemas/<entity>.test.ts
src/modules/<module>/repository/<entity>.test.ts
e2e/<module>.spec.ts
```

## Hard rules recap

- DataView for every list; never fork it.
- No hints/tooltips/helper text; copy only in `messages.ts`.
- Stored procedures only; zod at every boundary; RBAC + audit on every mutation.
- Green pipeline before un-drafting; never weaken a test.
- Bring the full breadth of capability: read the whole relevant surface (source
  analysis, standards, existing modules) before writing the first line, decide from
  first principles, and land complete work — no placeholders unless tracked in an
  issue.
