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
