# ADR-0024 — Per-person permission overrides and editable team titles

Status: Accepted · Date: 2026-10-09 · Session: datasheet (client feedback)
Amends ADR-0021 (per-project access levels) and ADR-0022 (managed lists).

## Context

ADR-0021 gives each team member one access level per project: Viewer,
Contributor or Manager. The client needs finer control per project. Examples:

- a Contributor who can also delete Parking lot items;
- a Viewer who may add Keywords;
- a Contributor who must not edit Daily activities.

They also want the team titles (Project manager, Sponsor, …) editable like the
other dropdowns, and the team edited inline like the datasheets.

## Decision

- **Overrides on top of the level.**
  - `app.ProjectPermissionOverride` holds `(ProjectId, UserId, Module, Verb,
    Allowed)` (migration 021).
  - `Verb` is `create`, `update` or `delete`. Reading always follows the level,
    so visibility, lists and cross-project filters are unchanged.
  - Overrides apply only to the sections in `OVERRIDABLE_MODULES`
    (`src/lib/auth/rbac.ts`). The charter and the team (`projects`) never take
    overrides, so nobody can grant themselves team management.
- **One enforcement point.**
  - `dbo.usp_Permission_Require` replaces the level comparison in
    `usp_Project_AssertAccess` and the to-do wrapper.
  - The override decides when four things hold:
    - the actor is a non-Admin member (a level was resolved);
    - the record has a project;
    - the call names a permission;
    - an override row exists for that section and verb.
  - Allowed = 1 passes even below `@MinLevel`. Allowed = 0 is FORBIDDEN_ROW even
    above it. Otherwise the level decides, as before.
  - Every write-level check in a section proc passes
    `@Permission = N'<section>:<verb>'`. `src/tests/proc-access-levels.test.ts`
    checks three things:
    - each literal matches the proc's own section and verb;
    - charter and team procs pass none;
    - the Set proc's section list equals `OVERRIDABLE_MODULES`.
- **The UI agrees with the procs.**
  - `usp_Project_GetAccess` returns the actor's overrides with their level.
    Pages use `allowsWithOverrides`.
  - The section list procs return `ActorGrants` / `ActorRevokes` per row
    (`dbo.ufn_Permission_Overrides`), and the datasheet's `rowAllows` reads them.
- **Managing overrides.** The team grid has a ⚙ per member with an account. It
  opens a section × Add/Edit/Delete matrix; each cell is "Default (yes/no)",
  Allow or Deny. Only differences from the level are stored.

  | Proc | Rules |
  |---|---|
  | `usp_ProjectPermission_List` | Manager on the project. |
  | `usp_ProjectPermission_Set` | Manager on the project. The target must be a live member with an account. A non-Admin can't change their own overrides. Audited. |

  `usp_ProjectAssignee_Set` deletes a person's overrides when they leave the
  team.
- **Team titles are a managed list.**
  - The list is `project-assignee.title`, seeded in 021: Project manager,
    Sponsor, Business analyst, Team member, Stakeholder.
  - 021 rewrites the codes to labels and drops `CK_ProjectAssignee_Role`.
  - `usp_ProjectAssignee_Set` checks each title with
    `usp_LookupList_AssertLabel`. A member keeps a retired title until it is
    changed, and renames cascade to the stored titles.
  - "Project manager" is locked: `usp_Project_Create` gives a new project's
    creator that title.
  - Titles still grant nothing: access comes from the level and the overrides.
- **Inline team grid.** Person, Title, Access, ⚙ and × sit in one bordered
  grid. A title or access change and a removal save at once. The persistent
  bottom row adds a person. Admins get "Edit list…" in the title select.

## Consequences

- A new project section must:
  - join `OVERRIDABLE_MODULES` and the Set proc's list;
  - pass `@Permission` in its write procs;
  - return `ActorGrants` / `ActorRevokes` from its list proc.

  The guardrail test fails until all three are done.
- Admins are never overridden (they hold Manager everywhere). Project-less
  records (the shared space, personal to-dos) have no overrides.
- The page's buttons, the datasheet's editable cells and the procs all read the
  same rows. A UI that is out of date still can't write past the procs.
