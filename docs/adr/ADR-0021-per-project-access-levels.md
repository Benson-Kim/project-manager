# ADR-0021 — Per-project access levels; global roles collapse to Admin and User

Status: Accepted · Date: 2026-10-08 · Session: security-fixes (S1, before wave 2)

## Context

Access was one global role per user (Admin, ProjectManager, Contributor,
Viewer) checked by `can(role, permission)` in the action wrapper, while the
procs separately asked "is the actor assigned to the project?". A person's
standing differs per project — the client example: Erick is the project
manager on project 1 and a stakeholder on project 10 — and a global role can't
express that. The two checks could also disagree: a global Contributor
assigned as the project manager still couldn't edit the charter. The S1 review
(docs/security/IDOR-getbyid-procs.md) also found GetById procs and reference
modules with no row-level check at all.

## Decision

- **Two layers, each with one job.**
  - **Global role** (`auth.Role`): `Admin` or `User`. `can(role, permission)`
    in `src/lib/action.ts` only separates the two: Admins get everything
    (including the admin module, #23); Users get every domain module.
  - **Project access level**: decides what a User may do inside a project. It
    is stored on the assignment row, `app.ProjectAssignee.AccessLevel`
    (FK `auth.AccessLevel`), with ranks Viewer 1 · Contributor 2 · Manager 3.
- **What each level allows** (`requiredLevel()` in `src/lib/auth/rbac.ts`):

  | Level | Read | Create / update | Delete, manage the team |
  |---|---|---|---|
  | Viewer | yes | no | no |
  | Contributor | yes | operational modules (`CONTRIBUTOR_WRITE_MODULES`: activities, to-dos, alerts, Q&A, parking lot, assumptions, meetings, notes) | no |
  | Manager | yes | every module | yes |

  The role column (ProjectManager, Sponsor, BusinessAnalyst, TeamMember,
  Stakeholder) stays a display title and grants nothing. Only rows linked to a
  user account (`UserId`) grant access. Stakeholders without an account are
  listed as Viewer and have no effect.
- **One rule in SQL.** `dbo.usp_Project_ResolveAccess` resolves the level:
  - Admin → Manager.
  - A project-less record → Contributor when the caller allows it (shared
    space), otherwise no access.
  - Otherwise → the highest level among the actor's live assignments.

  `dbo.usp_AccessLevel_Require` compares it and fails closed:
  - An unknown level is THROW 51000.
  - No access or too low a level is FORBIDDEN_ROW (50003).

  Every project-scoped proc calls `dbo.usp_Project_AssertAccess @MinLevel = N'…'`
  with a literal level, or calls one of the entity wrappers:
  - `usp_TodoItem_AssertAccess`
  - `usp_TodoAlert_AssertAccess`
  - `usp_DailyActivity_AssertAccess`

  Reads need Viewer; deletes need Manager. List procs assert Viewer when given
  a project; across projects they filter to the actor's projects (Admins see
  all).
- **To-dos are personal.** In `usp_TodoItem_AssertAccess`:
  - The owner holds Manager on a project-less to-do.
  - Anyone else needs Manager in the to-do's project.
- **Creating a project** is open to every User. `usp_Project_Create` makes the
  creator the project's ProjectManager with Manager access, so a new project
  always has someone who can manage it. Admins aren't auto-assigned.
- **The team is the access list.** `usp_ProjectAssignee_Set` (Manager only) is
  the single write path. It validates titles, active accounts, levels and
  duplicates. A non-Admin can't remove their own Manager access (VALIDATION),
  so no one locks themselves out.
- **The UI mirrors the procs.** Pages call `getProjectPermissions(projectId,
  userId)` (request-cached `usp_Project_GetAccess`) and show only the actions
  `canInProject(level, permission)` allows. Missing or inaccessible records
  render as not found (`orNull` / `orNotFound` in `src/lib/row-access.ts`).
- **Drift guard.** `src/tests/proc-access-levels.test.ts` reads db/procs and
  fails when:
  - a proc's literal `@MinLevel` differs from `requiredLevel()`, or
  - a project-scoped proc stops checking access, unless it is listed as exempt
    with a reason.
- **Migration 017:**
  - Creates `auth.AccessLevel` and adds the column.
  - Backfills levels from each linked user's old global role, and unlinked
    rows from their title.
  - Collapses the ProjectManager, Contributor and Viewer users into `User`,
    bumping SessionVersion so old tokens are revoked (ADR-0017). The provider
    also rejects any token that still carries a retired role.

## Consequences

- One person can hold different levels in different projects, and the UI and
  the procs agree by construction (one table drives both; the drift test
  enforces it).
- Procs take `@ActorUserId` only; `@ActorRole` parameters are gone.
- Being on no project means a User sees no projects. Admins assign people, or
  Users create their own projects.
- Inside a project, Contributors can't delete, not even their own to-dos;
  project-less to-dos stay fully theirs. This matches the previous global rule.
- Project-less records follow the same table at Contributor level. Everyone
  reads global keywords, but only Admins create, edit or delete them (a
  planning module); shared project-less activities can be added and edited by
  any User and deleted by Admins.
- Opening the access a step wider, for example letting Contributors create
  objectives, is a one-line change to `CONTRIBUTOR_WRITE_MODULES`, the
  matching `@MinLevel` literals and the drift test. Restricting project
  creation to Admins means denying `projects:create` to User in `can()` and
  adding an Admin check to `usp_Project_Create`.
- Supersedes the role matrix in ADR-0003's RBAC step and PLAN §9. The action
  wrapper still runs that step, now against the global role only.
