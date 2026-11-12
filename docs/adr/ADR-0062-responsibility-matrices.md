# ADR-0062: Responsibility matrices

- Status: Accepted. Choices not in the client's answers are ours and can be changed.
- Date: 2026-11-10
- Module: stakeholders. Builds on the WBS assignees (app.KeyDeliverableAssignee) and the decision log (migration 057)

## Context

The client wants a RACI chart, widened to nine frameworks: RACI, DACI, RAPID, DARE, RASCI, RACI-VS, ARPA, MOCHA and RATSI. A matrix has stakeholders as columns and either WBS items or decisions as rows. People already assigned to a WBS item must show in its row without being entered twice. The matrix gets its own page under Stakeholders; the Gantt is not changed.

## Decision

### 1. Frameworks are data

`app.ResponsibilityFramework` and `app.ResponsibilityRole` (migration 071) hold each framework and its roles, with a TypeScript registry that mirrors them and is checked against them by unit tests. A role carries `IsOnePerRow`, `IsRequired` and `IsAssigneeRole`. A new framework is new rows plus a registry entry; no proc changes.

| Framework | One per row | Required | Assignee role |
|---|---|---|---|
| RACI, RASCI, RACI-VS | A | A, R | R |
| DACI | D, A | D, A | Driver |
| RAPID | D | D | P |
| DARE | none | D | E |
| ARPA | A | A | R |
| MOCHA | M, O, A | M, O | Owner |
| RATSI | A | A, R | T |

MOCHA's Mover is shown as "Manager". Required roles are warnings in the UI, not write refusals, so a matrix can be filled in any order.

### 2. Tables

- `app.ResponsibilityMatrix`: project, name, framework, `RowKind` (`WbsItem` or `Decision`), soft delete, `RowVer`. Name is unique per project among live matrices.
- `app.ResponsibilityMember`: the stakeholder columns and their order, at most 40 per matrix.
- `app.ResponsibilityAssignment`: one stored cell, a row (a key deliverable or a decision, never both) by a member, with a role of the matrix's framework.

Deviations from the plan, on purpose:

1. No separate stakeholder foreign key on a cell: the member foreign key already pins the stakeholder to the matrix and project.
2. The unique name index is filtered to `IsDeleted = 0`, so a deleted matrix's name can be reused.
3. `DATETIME2` everywhere, like the rest of the schema.

The database backs every rule the procs rely on: `UX_ResponsibilityAssignment_WbsCell` and `_DecisionCell` (one cell per row and member), `FK_..._Member` (cells only for members of the same matrix), `FK_..._Role` with `UX_ResponsibilityMatrix_Shape` (a cell's role belongs to the matrix's framework), and `CK_ResponsibilityAssignment_Row` (exactly one row kind, matching the matrix).

### 3. The assignee role is the WBS assignee list

On WBS-item rows, the framework's assignee role is never stored as a cell. Setting it adds the person to `app.KeyDeliverableAssignee`; clearing or changing it removes them. Each such change bumps the deliverable's `RowVer` and writes an audit row on the deliverable, so the WBS and Gantt see it as an ordinary assignee edit. The `key-deliverables:update` permission is checked only when the assignees change.

A cell's role is resolved in one order, shared by the Set and List procs: a stored cell wins; otherwise, on WBS-item rows, a person assigned to the item holds the assignee role; otherwise the cell is empty. An assignee who is not a column of the matrix is listed with `IsMember = 0` as a hint on the row. Decision rows have no assignee list, so every role, the assignee role included, is stored.

### 4. Concurrency

- Matrix and member changes carry the matrix `RowVer`; a stale one is 409.
- A cell has no version of its own. Set is compare-and-set on the role the client saw (`@ExpectedRoleCode`); a different current role is 409.
- Every cell write locks the matrix row first, then the deliverable, always in that order, so writes to one matrix run one at a time and cannot deadlock against each other.
- A one-per-row role held by someone else is 409 unless the caller asks to move it, which takes it from them in the same transaction.

### 5. Access and audit

Reads need Viewer with `stakeholders:read`. Creating a matrix needs Manager with `stakeholders:create`, deleting one `stakeholders:delete`, and every other write `stakeholders:update`. A cell write that changes a WBS item's assignees also needs `key-deliverables:update`, so the matrix never edits the WBS for someone who may not. Every proc takes the project id, checks access on it before any lookup, and finds the matrix only within that project: another project's matrix is NOT_FOUND on the list and on every write. Every write adds one audit row inside its transaction.

### 6. Left out on purpose

- No Gantt column or WBS editor changes; the matrix page is the only new surface.
- No paging on cell lists: 40 columns by the project's rows is bounded and small.
- No history view beyond the audit log.

## Consequences

- Removing a stakeholder column deletes its stored cells but leaves WBS assignees alone; they show again as row hints.
- Deleting a WBS item or decision hides its cells; they are not purged.
- A WBS assignee edit made elsewhere shows in every WBS-row matrix of the project at once, with no sync job.

## Build slices

1. Registry, schema, procs and database tests (this ADR).
2. Schemas, repository and server actions, with unit tests for the flag rules of every framework.
3. The matrix page: header link, picker, grid on WBS or decision rows, toolbar and legend.
4. Undo and Redo, CSV export, end-to-end and accessibility tests.
