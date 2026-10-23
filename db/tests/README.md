# db/tests

Behaviour checks that run the stored procedures against a seeded database (the CI `db-apply`
job, after the seeds, with `E2E_SEED=1`). CI connects them as the app's EXECUTE-only login
(`pm_web`, ADR-0033), so they also prove each proc works without any table right; they call
procs only and need nothing more. They complement the static guardrails in `src/tests`:
those pin what the proc text says; these prove what the procs do (access across projects and
owners, quotas, concurrency, money rules). Each script exits non-zero on the first failing group
and prints `N passed, M failed`.

- `financials-procs.cjs` — ADR-0029/0031: financial templates, financials, lines, transactions,
  tax profiles.
- `financial-documents-procs.cjs` — ADR-0030: template documents and their validation, the
  snapshot copy, roles and overrides, access across projects, duplicate names, caps, moves, copy
  from a template, attachments (quota, cross-owner ids both ways), cascades, dropped legacy procs.
- `financial-documents-race.cjs` — ADR-0030 under concurrency: the document cap, unique names
  (creates, copies, renames), the file quota, and delete versus attach.
- `requirements-procs.cjs` — ADR-0037: roles and overrides, object-level access across projects,
  the trace and allocation rules (need vs solution, same project, no self-link), per-project
  reference numbers never reused, the shared met tick across deliverables, a deliverable delete
  that keeps the requirements, a requirement delete that removes its links and allocations, and a
  create whose links fail after the insert leaving nothing behind.
- `requirements-race.cjs` — ADR-0037 under concurrency: parallel creates get distinct numbers,
  a link racing a delete leaves no link to a deleted row, a type change racing a new link stays
  valid, and parallel moves under one deliverable leave the order 1..n.
- `boards-procs.cjs` — ADR-0038: the board as its own access scope, the standalone shared space
  (everyone a contributor, the creator its manager), per-person overrides on a project board and
  never on a standalone one, rowversion concurrency, the starting-columns payload validation,
  LIKE-metacharacter search, and a board whose project was deleted.

Run one locally with the `.env` of a throwaway database: `node db/tests/financials-procs.cjs`.
Never run them against a database anyone depends on: they create projects and leave
soft-deleted rows behind.
