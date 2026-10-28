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
- `key-deliverable-assignees.cjs` — migration 015: none, one and many assignees on a deliverable,
  clearing the set, a repeated id landing once, and a stakeholder of another project being dropped
  rather than refused.
- `key-deliverable-milestone.cjs` — migration 043 / ADR-0046: a milestone is one day and has no
  sub-items. Creating one as a date, refusing one asked for with a span, converting either way,
  dragging but not stretching it, an update deriving its end from its start, no item under a
  milestone (create and move) and no parent becoming one, a stale RowVer conflicting, and its one
  day rolling up into its parents.
- `key-deliverable-dependency.cjs` — migration 044 / ADR-0046 decisions 5-10: the rules no
  constraint can express and the scheduler itself. A self-link, a duplicate ordered pair, a cycle,
  an ancestor pair and a cross-project pair all refused; each of the four types at its boundary
  (including FS and SS at lag 0, where they differ by one day); a lag pushing further; a push
  carried down a chain and re-run when the head is dragged; a predecessor moved earlier leaving its
  successors put (push-only, decision 7); a successor dragged too early put back; a summary
  successor moved as a branch and rolled up; a pushed milestone keeping its one day; an undated end
  scheduling nothing; a link read back on its successor row with its RowVer; retyping, a stale
  RowVer conflicting, an idempotent no-op relink, unlinking and re-linking the same pair; a deleted
  item taking the links at both of its ends; and a link alone moving the Gantt freshness stamp.
- `requirements-race.cjs` — ADR-0037 under concurrency: parallel creates get distinct numbers,
  a link racing a delete leaves no link to a deleted row, a type change racing a new link stays
  valid, and parallel moves under one deliverable leave the order 1..n.
- `notes-procs.cjs` — ADR-0035 and its 2026-10-23 amendment: the project-less shared space
  (every user reads, creates and edits notebooks and pages; only an Admin deletes), project
  notebooks that keep their project's levels, and the cross-project list (the actor's projects
  plus the shared space, the No project filter, each row's project name).
- `notes-race.cjs` — the shared space under concurrency, where any user may write: parallel saves
  of one page (one winner, no lost update), parallel page adds (distinct places), an add or a
  save racing the notebook's delete (the page goes with it), a reorder racing an add, a save
  racing the page's delete, two Admins deleting the same row, a rename or reorder racing the
  notebook's delete, parallel adds at the 500-page cap and delete-plus-add churn there, and a
  mixed load of six users.
- `boards-procs.cjs` — ADR-0038: the board as its own access scope, the standalone shared space
  (everyone a contributor, the creator its manager), per-person overrides on a project board and
  never on a standalone one, rowversion concurrency, the starting-columns payload validation,
  LIKE-metacharacter search, and a board whose project was deleted. Then the cards: a column or
  neighbour from another board refused, the assignee rule, the work-in-progress limit, an edit
  that can move nothing, the five-set board read and its counts, the assignee picker, and a
  column delete that reflows its cards and never takes a board's last column. Then the phases
  and sprints: a phase released of its sprints rather than deleted with them, a sprint created
  planned, the second start refused while one is running, a completion that moves the unfinished
  cards and keeps the done ones, and a completed sprint that can be neither edited nor deleted.
- `boards-race.cjs` — ADR-0038 under concurrency: 20 creates into a column of limit 5 leave
  exactly 5, 20 moves into the last free slot leave exactly 1 winner, a forced renumber never
  surfaces as INTERNAL and never leaves two cards sharing a rank, an edit racing a move of one
  card gives one winner and one CONFLICT, and no live card is left in a deleted column or on a
  deleted board. Then the sprint lifecycle: one sprint starts out of ten parallel attempts (never
  as error 2601), one completion moves the unfinished cards once, no unfinished card is stranded
  in a completed sprint, and no live card or sprint is left pointing at a deleted sprint or
  phase. The packaging and board-relink races wait for those procs (slices B4-B5); the file
  lists them so the gap is visible.

Run one locally with the `.env` of a throwaway database: `node db/tests/financials-procs.cjs`.
Never run them against a database anyone depends on: they create projects and leave
soft-deleted rows behind.
