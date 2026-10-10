# Security Finding — IDOR on GetById stored procedures

**Discovered:** code-review pass on `feature/key-deliverables`  
**Severity:** High  
**Status:** Fixed on branch `fix/idor-getbyid` (S1, wave 1; PR link added on merge)

---

## Resolution

Fixed more broadly than the pattern proposed below, by
[ADR-0021](../adr/ADR-0021-per-project-access-levels.md) (per-project access
levels):

- **No role parameter.** Procs no longer take `@ActorRole`: a caller-supplied
  role can't be trusted. They resolve access from `@ActorUserId` through one
  rule, `dbo.usp_Project_AssertAccess @MinLevel`.
- **Every project-scoped proc checks access**, not only the seven GetById procs
  listed: GetById, List, Create, Update, Delete and the business procs of
  every module, including the reference modules that had inline checks.
  `src/tests/proc-access-levels.test.ts` fails if one stops checking.
- **NOT_FOUND vs FORBIDDEN_ROW** is preserved in SQL. Pages map both to
  not-found (`orNull` / `orNotFound`, `src/lib/row-access.ts`), so a URL never
  reveals whether a record exists.
- **Verified** against a shadow schema on SQL Server: 78 procs deployed,
  197 access cases (outsider, inactive user, Viewer, Contributor, Manager,
  Admin, owner vs non-owner to-dos, cross-project lists) all pass. The
  e2e-viewer specs check the not-found page across every section of a project
  the viewer is not on.

The original finding is kept below for the record; its `@ActorRole` fix
pattern is superseded.

---

## Description

Seven `GetById` stored procedures accept `@ActorUserId` but perform no
project-scope check. Any authenticated user who knows (or enumerates) a row ID
can read rows belonging to projects they are not assigned to.

The pattern that is **missing** in the affected procs is the row-level check
already implemented correctly in `usp_Supplier_GetById`:

```sql
IF ISNULL(@ActorRole, '') <> N'Admin'
   AND NOT EXISTS (
       SELECT 1 FROM app.<Entity> e
       JOIN app.ProjectAssignee pa
           ON pa.ProjectId = e.ProjectId AND pa.UserId = @ActorUserId
          AND pa.IsDeleted = 0
       WHERE e.<EntityId> = @<EntityId> AND e.IsDeleted = 0
   )
    THROW 50003, N'FORBIDDEN_ROW:You are not assigned to this project', 1;
```

---

## Affected procedures

| Proc | File |
|---|---|
| `usp_DailyActivity_GetById` | `db/procs/daily-activity/usp_DailyActivity_GetById.sql` |
| `usp_KeyDeliverable_GetById` | `db/procs/key-deliverable/usp_KeyDeliverable_GetById.sql` |
| `usp_Keyword_GetById` | `db/procs/keyword/usp_Keyword_GetById.sql` |
| `usp_Objective_GetById` | `db/procs/objective/usp_Objective_GetById.sql` |
| `usp_QuestionAnswer_GetById` | `db/procs/question-answer/usp_QuestionAnswer_GetById.sql` |
| `usp_Stakeholder_GetById` | `db/procs/stakeholder/usp_Stakeholder_GetById.sql` |
| `usp_TodoItem_GetById` | `db/procs/todo-item/usp_TodoItem_GetById.sql` |

Each proc also needs `@ActorRole NVARCHAR(50) = NULL` added as a parameter, and
the calling repository function needs to pass `session.role`.

---

## Affected repository call sites

Each of the following must be updated to pass the actor's role once the procs
are fixed:

| Repository | Function |
|---|---|
| `src/modules/daily-activities/repository/daily-activities.ts` | `getDailyActivityById` |
| `src/modules/key-deliverables/repository/key-deliverables.ts` | `getKeyDeliverableById` |
| `src/modules/keywords/repository/keywords.ts` | `getKeywordById` |
| `src/modules/objectives/repository/objectives.ts` | `getObjectiveById` |
| `src/modules/questions-answers/repository/question-answers.ts` | `getQuestionAnswerById` |
| `src/modules/stakeholders/repository/stakeholders.ts` | `getStakeholderById` |
| `src/modules/todo-items/repository/todo-items.ts` | `getTodoItemById` |

---

## Fix pattern (per proc)

1. Add `@ActorRole NVARCHAR(50) = NULL` parameter.
2. After the `NOT_FOUND` check, add the `FORBIDDEN_ROW` check joining through
   `app.ProjectAssignee` as shown above.
3. In the repository function, add `actorRole: string` parameter and forward it
   as `ActorRole` to `execProc`.
4. In every action that calls the repository function, pass
   `session.role` (from `auth.requireSession()`).

See `usp_Supplier_GetById.sql` as the reference implementation.

---

## Notes

- `usp_Keyword_GetById` must handle `ProjectId IS NULL` (global keywords are
  not project-scoped; skip the check when `ProjectId` is null).
- `usp_TodoItem_GetById` has user-owned rows (CreatedBy); the check may need to
  be `ProjectId IS NULL OR actor is assigned` depending on the data model.
- The `Viewer` role should be allowed read access within their assigned projects;
  the check must not block Viewers.
