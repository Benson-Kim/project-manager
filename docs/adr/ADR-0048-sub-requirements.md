# ADR-0048 — Sub-requirements: the register becomes a tree

- **Status:** Accepted for decisions 1–7. **Provisional** for decisions 8 and 9, which are the
  client's to settle and are implemented as refusals until they do.
- **Date:** 2026-10-27
- **Supersedes:** nothing. Extends ADR-0037 (the requirement register), ADR-0016 (paged lists) and
  ADR-0046 (the WBS/Gantt surface that also renders a requirement reference). Closes the one
  correction ADR-0047 left open.
- **Migrations:** 048_requirement_sub_requirements.sql

## Context

On the Requirements page of the marked-up 1.0.12 sheet, with a mock-up screenshot, the client
wrote:

> The requirements BR, SR, FR, NF, TR all should be able to create subrequirement
> E.g. subBR1.1, subBR1.2 then subBR1.1.1, subSR1.1, subSR1.2
> (as many subs as necessary) (normally this does not going for long.)

Their mock-up settles two design questions for free, and both are taken as given below: a
sub-requirement's **Type column reads "Sub-Requirement"** while its **Ref carries the parent's
letters** (`FR-1.1`), so the type is inherited rather than chosen; and "normally this does not
going for long" is permission to cap the depth.

ADR-0047 built every other correction on that sheet and stopped here deliberately. This is not a
field, it is a tree: `(ProjectId, RequirementType, Number)` was the identity of a requirement, and
`FR-3` was composed from two of those columns in eight places. The honest comparison is ADR-0046's
milestones and dependencies, which took a session of its own and still shipped two defects that
only CI found.

## Decisions

### 1. The tree is one nullable self-reference, and nothing else

`app.Requirement.ParentRequirementId INT NULL`. NULL is a root, which is every row that exists
today — so **no number and no reference in the product changes when 048 is applied**. That is the
property that makes this safe on a live register, and it is why the numbering below is scoped by
parent in a way that reduces to the old behaviour for a NULL parent.

No `Depth` column, no materialised `Path` column, no closure table. A stored path goes stale behind
a renumber, and a closure table is three invariants where one will do.

Invariants, and honestly where each one lives:

| Invariant | Held by | Strength |
|---|---|---|
| A child's parent is in the same project | `FK_Requirement_Parent`, composite over `(ParentRequirementId, ProjectId)` against 036's `UQ_Requirement_Project` | strong |
| A requirement is not its own parent | `CK_Requirement_NotSelfParent`, table-level (a column CHECK naming a second column is error 8141) | strong |
| One number per parent | `UX_Requirement_Number` re-keyed to `(ProjectId, RequirementType, ParentRequirementId, Number)` | strong |
| A child's type equals its parent's | `usp_Requirement_Create`, under the project lock | medium |
| Depth ≤ 4 levels | `usp_Requirement_Create`, under the project lock | medium |
| No cycles | Unreachable by construction — see decision 3 | n/a |

A composite FK with a NULL column is not checked at all (MATCH SIMPLE), so a root row passes
`FK_Requirement_Parent` untouched, and `ParentRequirementId <> RequirementId` is UNKNOWN for a root,
which a CHECK accepts. Both constraints therefore constrain only children, which is what is wanted.

SQL Server treats NULLs as **equal** in a unique index. That is normally a nuisance; here it is the
whole mechanism, because it is what keeps root numbering unique once the parent joins the key.

### 2. The shared unique index keeps serving the Gantt freshness stamp

036's comment warns that `UX_Requirement_Number` is also the Gantt stamp's index, so changing its
key order changes two readers. It was checked rather than assumed: the stamp is
`SELECT MAX(CAST(RowVer AS BIGINT)) FROM app.Requirement WHERE ProjectId = @ProjectId`
(`usp_KeyDeliverable_GanttData`). `ProjectId` is still the leading key column and `RowVer` is still
in the INCLUDE list, so that seek is unchanged. **No separate stamp index is added.**

`IX_Requirement_Parent` is added, filtered to non-NULL parents, for the child lookups the two
refusals and the depth walk need — the unique index cannot serve those, because its leading column
is the project and not the parent.

### 3. Parentage is set once, at create, and cycles are therefore unreachable

`usp_Requirement_Create` is the only proc that ever writes `ParentRequirementId`. No proc re-parents
a requirement, and the sheet shows the parent as a **read-only line rather than a picker**:
re-parenting is a second feature and the client did not ask for it.

That is not just scope control, it removes an invariant. A newly inserted row cannot be an ancestor
of anything, so the only way to build a cycle is to re-parent an existing row — which does not
exist. **No recursive cycle check is needed in any write**, only the depth walk.
`CK_Requirement_NotSelfParent` remains as the backstop against direct SQL, and a guardrail test
asserts no proc but Create assigns the column.

If re-parenting is ever asked for, this decision is what has to be reopened first, and it will need
the cycle check this ADR currently does without.

### 4. The reference is a recursive walk with exactly one definition

`ufn_Requirement_AncestorPath(@RequirementId)` returns `Ref` (`FR-1.1.1`), `SortPath` and `Depth`,
built by walking **up** from the row — the shape `ufn_KeyDeliverable_Ancestors` already established,
bounded the same way.

Every surface that shows a reference reads it from there:
`usp_Requirement_{List,GetById,ListOptions}`, `ufn_Requirement_Links` for the trace chips, and
`usp_KeyDeliverable_GanttData` for the WBS chip. **Nothing composes a reference from a type and a
number any more**, in SQL or in TypeScript.

Why derived and not stored: the register is paged (ADR-0016, 100 rows), so a child can land on a
different page from its parent, and the browser cannot assemble a path for a row whose parent it was
never sent. The walk is one seek per level and the depth is capped at four, so it is bounded
wherever it is applied. Its cost is a bounded walk per row rather than per page; if a very large
single project ever makes that show, the fix is a stored path behind this same function, which is a
contained change precisely because there is only one definition.

`SortPath` is padded to **ten digits per level**, not four. `'1.10'` sorts before `'1.2'` as text,
so the padding is what makes the order right; ten digits is the widest an INT can be, so it is
correct for every value `CK_Requirement_Number` permits rather than only for small ones. Four digits
would have been a silent cap at 9,999.

### 5. The default order becomes the path, and Ref still carries no sort control

`usp_Requirement_List` computes `Ref`, `SortPath` and `Depth` **inside** its paging CTE, not beside
it, because the default order *is* the path — computed after the page was cut, a sub-requirement
would land on a different page from its parent. The default order is catalog type order then
`SortPath`, and `REQUIREMENT_SORT.default` stays `null` for the reason it already was: no single
column reproduces that order, and now the second half of it is a recursive path.

A `@Type` or `@Search` filter applies to **rows, not branches**: a sub-requirement that matches is
returned whether or not its parent did. Its Ref is the whole path, so the row still says where it
belongs even when its parent is not on the page. Filtering whole branches in or out would mean
returning rows nobody searched for, or hiding rows that match.

### 6. TypeScript loses `requirementRef` rather than gaining a wrapper

`requirementRef(type, number)` is **deleted**, not re-signed to take a row. A one-line wrapper
returning `row.Ref` would be a function that exists only to be imported. Deleting it is also what
made the compiler point at all eight call sites, which is the reason the handoff asked for a
signature change in the first place.

`refList` stays, because it still does something: it sorts by catalog type order then `SortPath`.
It compares paths with `<` and `>` rather than `localeCompare` — ICU collation can ignore
punctuation at primary strength and read `"1.10"` as `"110"`, which would undo the padding. The same
comparison, for the same reason, is in the export's `inRegisterOrder`.

`parentRefOf(ref)` derives the parent's reference by dropping the last segment, so the sheet can
name the parent without a second column and without a second read. The path contains its own
ancestry; a `ParentRequirementRef` column would be a second source for the same fact.

### 7. The row carries `ChildCount`, so the UI refuses before the proc does

`usp_Requirement_List` and `usp_Requirement_GetById` send the count of live children. With it, the
register withholds the Type cell and the Delete button on a row the procs would refuse, and says
why (STANDARDS §5.6) — rather than letting the save fail and explaining afterwards.

`ParentRequirementId` is deliberately **not** in the row contract. `Depth > 0` says a row is a child
and `Ref` contains its parent's reference, so the column would be a third way to ask the same
question.

### 8. Deleting a parent that still has children is refused — **provisional**

Three options were honest: refuse; soft-delete the whole subtree; or promote the children and
renumber them. Promotion renumbers references the client may already have quoted in a document,
which is the argument against it. Subtree deletion takes rows the user did not name.

**Refusing is implemented**, with a message naming how many children must go first. It is chosen
because it is the one option that is reversible in both directions: refusal can become either of the
others later without a migration and without having destroyed anything meanwhile, whereas a
cascade that turns out to be unwanted has already taken the rows.

The client has been asked (`docs/client-feedback-2026-10-26.md`). **This decision is theirs**; it is
recorded here as provisional so the next session does not re-derive it or mistake it for settled.

### 9. Changing a parent's type while it has children is refused — **provisional**

Two options: the children's type follows the parent, and every one of their references changes; or
the change is refused while children exist. **Refusal is implemented**, for the same reversibility
reason, and because a reference silently becoming something the client never renamed is the failure
mode they would notice last.

A **child** has no type of its own to change at all — its type is its parent's — so that is refused
outright and is not provisional. It follows from the mock-up, not from a choice of ours.

### 10. Merge was not a third question, and this says so

`mergeSelection` creates a *new* solution that validates the selected needs and never removes the
originals, so a merged-from need keeps its children untouched. That reading was checked against
`register-model.ts` rather than assumed. It is recorded here so it is not reopened.

## Consequences

- A number alone no longer identifies a requirement; `Number` is unique only under its parent. Any
  future code that reaches for `Number` to name a row is wrong, and `Ref` is what it wants.
- The trace picker offers sub-requirements: a sub-BR is a need like any other, and the client's own
  example names `subBR1.1`.
- Four levels is a limit the client can ask to raise in one constant (`MAX_REQUIREMENT_DEPTH`) and
  one proc literal, which a guardrail test keeps in step.
- `scripts/db-apply.sh` and `electron/db-apply.ts` now apply every `ufn_` before any `usp_`. An
  inline table-valued function is bound when it is created, so one that reads another must meet it
  already there, and folder-then-file order put `ufn_Requirement_AncestorPath` after the
  `key-deliverable/` proc that reads it. This replaces an ordering that happened to work with one
  that is guaranteed to.
- The WBS/Gantt JSON carries `ref` in place of `number`. That surface was the one ADR-0046 shipped a
  defect on for exactly this reason, so it is asserted in both the Vitest and the proc tests.
- Depth and type inheritance are proc-level, not constraint-level. Direct SQL can still write a
  fifth level or a child of a different type. Said plainly here because it is the gap this design
  accepts.

## Verification

- `db/tests/requirements-procs.cjs` runs the tree against real SQL Server in CI's `db-apply` job:
  per-parent numbering, the path, inherited type, the depth cap, the cross-project parent, both
  refusals, `1.2` before `1.10`, the trace chip's path, the Gantt chip agreeing with the register,
  and that a pre-existing root keeps its reference. None of this is reachable from Vitest.
- `src/tests/requirement-sql-guardrails.test.ts` holds the shape: every proc answering a requirement
  row names every column the schema requires (the check that was missing when migration 047 shipped
  two procs short of a column), the single definition of a reference, 048's constraints and
  idempotency, and that no proc but Create writes `ParentRequirementId`. Two of these were
  mutation-checked rather than assumed green.
- Vitest covers the rendering and the ordering in `register-model`, `requirement-rules`, `export`
  and `wbs`.
