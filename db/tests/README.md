# db/tests

Behaviour checks that run the stored procedures against a seeded database (the CI `db-apply`
job, after the seeds, with `E2E_SEED=1`). They complement the static guardrails in `src/tests`:
those pin what the proc text says; these prove what the procs do (access across projects and
owners, quotas, concurrency, money rules). Each script exits non-zero on the first failing group
and prints `N passed, M failed`.

- `financials-procs.cjs` — ADR-0029/0031: financial templates, financials, lines, transactions,
  tax profiles.

Run one locally with the `.env` of a throwaway database: `node db/tests/financials-procs.cjs`.
Never run them against a database anyone depends on: they create projects and leave
soft-deleted rows behind.
