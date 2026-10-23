# ADR-0040 — A project the actor cannot see answers NOT_FOUND, not FORBIDDEN_ROW

Status: Proposed · Date: 2026-10-23 · Session: requirement-traceability defensive review (finding 2)
Amends ADR-0012 (which code a row guard throws) and ADR-0021 §access levels. Numbered 0040 because
`feature/boards` holds 0038 (accepted, pushed, cited in its procs) and `docs/BOARDS-TRACKING.md` on
that branch reserves 0039 by name for the WBS/Gantt colour-mode ADR. Nothing here is implemented:
this ADR exists so the gap recorded in
[ADR-0037](ADR-0037-requirement-types-and-traceability.md) "Two project-wide findings" cannot be
closed, or quietly widened, inside a feature branch.

## Context

Every project-scoped proc resolves the row's project and calls `dbo.usp_Project_AssertAccess`
(ADR-0021). 76 of them throw `50001 NOT_FOUND` for an absent row **before** that call, and
`usp_Supplier_Update` records the reason: do not open a transaction for a row that is not there.
Four procs assert first, three of them creates, where the project comes from the payload rather
than from a row.

The order is not the problem. The two answers are:

| The actor sends | Today |
|---|---|
| an id that does not exist | `50001 NOT_FOUND` |
| an id in a project they hold no access to | `50003 FORBIDDEN_ROW` ("You are not assigned to this project") |

So a signed-in user learns which ids exist in projects they cannot read. Ids are per-table
identities, so one id at a time the whole table is countable. Nothing else leaks — no field, no
project name, no count — and three things bound it: mutations are Server Actions behind the session
gate, the per-user throttle (ADR-0031) runs before the proc, and a reader learns existence only,
never content. It is an enumeration oracle, not a data leak, which is why it was left open rather
than fixed inside the requirements branch.

ADR-0037's finding said closing it "touches every module's write procs". That is wrong, and the
correction is the reason this ADR is worth writing: the distinction lives in exactly one proc.
`usp_Project_AssertAccess` → `usp_Permission_Require` → `dbo.usp_AccessLevel_Require`, which already
has the two branches apart:

```sql
IF @Level IS NULL
    THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;   -- no access at all
IF ISNULL((SELECT [Rank] FROM auth.AccessLevel WHERE Name = @Level), 0) < @MinRank
    THROW 50003, N'FORBIDDEN_ROW:Your access to this project does not allow this', 1;
```

`@Level IS NULL` is precisely "the actor is not in this project". Every other refusal — a level
below the one the action needs, a per-person override set to Allowed = 0 (ADR-0024) — happens to
someone who can already see the project, and tells them nothing they did not know.

## Decision (proposed)

1. **`usp_AccessLevel_Require` throws `50001 NOT_FOUND` when `@Level IS NULL`**, with the same
   message a missing row gives. A non-member then cannot tell an id that exists from one that does
   not, in any proc, read or write, without any proc changing its order.
2. **`50003 FORBIDDEN_ROW` keeps its second branch**: a resolved level below `@MinLevel`, and an
   override denial in `usp_Permission_Require`. That is the useful, actionable refusal — "you can
   see this project, but not at the level this needs" — and it stays distinct.
3. **All four ADR-0012 codes stay.** What changes is which one a non-member receives. ADR-0012 gains
   one line: NOT_FOUND also covers "a project the actor holds no access to".
4. **`messages.errors.NOT_FOUND`** stops asserting absence: "This record no longer exists." becomes
   wording that is true in both cases (e.g. "This record is not available."), and
   `src/tests/messages-tone.test.ts` must still pass.
5. **Project-less rows are out of scope.** For the `@AllowProjectless = 1` entities (daily
   activities, keywords, to-dos) a NULL project means the row is in the shared space and visible to
   everyone, so NOT_FOUND there leaks nothing and the behaviour does not change.
6. **A guardrail pins it**: a test asserting that the only `THROW 50003` reachable from
   `usp_AccessLevel_Require` is the rank comparison, and asserting the number of procs that route
   through `usp_Project_AssertAccess`, so the sweep cannot silently match nothing.

## Consequences

- One proc changes. No module's procs, no repository and no action wrapper change.
- The `db/tests/*.cjs` suites move: 28 assertions expect `50003`, and at least 7 are the non-member
  case by their own label ("create in another project", "get file from another project", "sheet of
  another project"…). They become `50001` in the same commit as the proc; the rest, which are
  level-and-override cases, stay as they are.
- `docs/security/IDOR-getbyid-procs.md` (S1) and `docs/STANDARDS.md` §2.3's row-access rule gain the
  distinction; `src/tests/proc-access-levels.test.ts` is unaffected, as it maps `@MinLevel` literals
  rather than codes.
- A member who opens a row a colleague has just deleted still gets NOT_FOUND, which is what they
  want to read. A non-member gets the same sentence, which is the point.
- Cost of not doing it: an authenticated user can count the rows of any table one id at a time,
  throttled, learning existence only. That is why this is Proposed rather than urgent.

## Not in scope

Any change to the order in which a proc resolves a row, asserts and throws. ADR-0012's codes and
`usp_Supplier_Update`'s rationale both stand, and the 76 procs keep their shape.
