# bugs.md — findings from the 5-PR integration into `develop` (2026-10-04)

Raised while merging PRs #14–#18 into `develop`. Each entry is a defect or an
integration decision that needs a follow-up fix **after** all code is merged.
Nothing here was fixed during the merge unless the entry says so explicitly —
the merge's job was to land every change and resolve conflicts in favour of the
concrete fixes.

Severity: **P0** breaks the build/pipeline · **P1** wrong behaviour or security ·
**P2** correctness/UX/a11y/standards · **P3** docs & hygiene.

Status: `OPEN` · `FIXED-IN-MERGE` (resolved while merging; verify) · `DECIDED` (integration
decision recorded, no code change needed).

---

## A. Integration decisions taken during the merge

### A1 — `DECIDED` Grouped disclosure nav wins over the flat pill row
`src/components/shell/project-section-nav.tsx`

Four branches disagreed about project section navigation:

| Branch | Position |
|---|---|
| `origin/feature/key-deliverables` (#15) | grouped disclosure + **`createPortal` panels** (`01fe957`) |
| `feature/questions-answers` (#17) | grouped disclosure + ADR-0019 (76-line variant) |
| `feature/assumptions-constraints` (#18) | grouped disclosure + ADR-0019 (43-line variant) |
| `feature/parking-lot` (#16) | **reverted** to the flat scrollable pill row (`4c3c3ad`, "per ADR-0018") |

Resolution: kept the **grouped disclosure nav with portal-rendered panels**.
Rationale — it is the newest work (2026-10-04 13:52), it is the only version that
actually fixes the Codex finding repeated on #15/#17/#18 (panels clipped by the
`overflow-x-auto` ancestor) instead of side-stepping it, three of four branches
agree with it, and `overflow-x-auto` is retained on the pill row so the 360 px
mobile overflow objection is also satisfied. `feature/parking-lot`'s revert
(`4c3c3ad`) was therefore **discarded** at merge time.

Follow-up: confirm ADR-0019 states this plainly and supersedes ADR-0018 §2 (see D1).

### A2 — `FIXED-IN-MERGE` `scripts/seed-deliverables-p1.sql` deleted
Git kept this file through the #15 merge (develop added it via the `c1f44af`
cherry-pick; the base commit never had it, so the deliberate deletion on two
branches did not propagate). It was removed by hand.

It deserves to stay deleted: it issues a hard `DELETE FROM app.KeyDeliverable`
(bypassing soft delete and the audit trail) and `INSERT`s directly into the table,
violating the stored-procedure-only gateway rule (AGENTS.md / STANDARDS §4).
Both `origin/feature/key-deliverables` (`84e1031`, "remove unaudited destructive
seed helper") and `feature/questions-answers` had already dropped it.

### A3 — `FIXED-IN-MERGE` `docs/ux/project-workspace-navigation.md` restored
`c7035a7` (in #15's history) deleted this file, but
`docs/adr/ADR-0018-project-workspace-navigation.md:8` still links to it
(`../ux/project-workspace-navigation.md`) — a dead relative link in an accepted
ADR, the exact failure mode LESSONS §9/§14 warns about. Restored from `925bde2`.

### A4 — `OPEN` P3 — two further docs deleted by `c7035a7` without explanation
`docs/plans/project-nav-suppliers-keywords-plan.md` (322 lines) and
`docs/codex-reviews/PR-011-questions-answers-codex.md` (148 lines) were removed in
a commit whose subject is "Gantt chart multi-assignee support and accessibility
improvements". Nothing references them, so the deletions were left in place —
but they look incidental rather than intended. Decide whether the PR-011 review
record should be kept as history.

---

## B. Project-wide gaps found by later reviews

Same severity and status keys as section A. Raised outside the 5-PR merge, by a review that found
them while working on one module; each belongs to the whole code base, so none was fixed in the
branch that found it.

### B1 — `OPEN` P2 — no route segment has an `error.tsx`, and only one has a `loading.tsx`
`src/app/(app)/**`, found by the requirement-traceability review (2026-10-23)

`docs/STANDARDS.md` requires both per route segment in three places — §1.1 ("`src/app/(app)/<module>/`
holds thin routes only (`page.tsx`, `loading.tsx`, `error.tsx`)"), §7 ("Error boundaries
(`error.tsx`) per route segment with a retry button") and §9 ("Streaming: `loading.tsx` per route
segment"). Behind 35 `page.tsx` files the app has one `loading.tsx`
(`src/app/(app)/projects/[id]/loading.tsx`), no `error.tsx` anywhere, no `global-error.tsx`, and a
root `src/app/not-found.tsx`. So a server error in any segment renders Next.js's own fallback
instead of the app's shell, and no list page streams a skeleton.

Not a decision to take — the decision is already recorded, and three sessions' reviews (including
the one that found this) mis-filed it as an open UX question. What is missing is the sweep.

The pieces already exist: `ErrorState({ title, onRetry })` in `src/components/ui/states.tsx`
(with `ListSkeleton` beside it) and `messages.actions.retry` ("Try again"). An `error.tsx` is a
client component taking `{ error, reset }`, so `onRetry={reset}`, and the copy must come from
`src/lib/messages.ts` or `src/tests/messages-tone.test.ts` fails. Worth settling in one pass: one
shared pair of boundary components, used by every segment, plus an e2e check that a thrown error in
a segment shows the app's own page — and then a guardrail that fails when a `page.tsx` has no
sibling boundaries, so the gap cannot come back.
