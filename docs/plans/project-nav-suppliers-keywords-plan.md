# Plan: Project workspace grouped navigation + Suppliers + Keywords

> **Decision recorded (2026-09-16):** Notes belongs in the **Activity** group (written
> during/after project work, same cadence as meetings, daily activities, parking lot).
> Keywords is the sole member of the Activity group's "reference" tail — no separate
> Reference group. The 4 groups are final: Overview · Planning · People & Resources · Activity.

## Overview

The project workspace section navigation (`src/components/shell/project-sections.ts` +
`project-section-nav.tsx`) is being redesigned from a flat scrollable link row into a
**grouped disclosure-button nav**: 4 group pills (Overview, Planning, People & Resources,
Activity) each toggle a dropdown of their member section links on click. The current
`projectSections` array already names the 4 groups but the nav component treats them as
flat links — those must become disclosure buttons. Existing individual routes
(`/projects/[id]/deliverables`, `/projects/[id]/suppliers`, etc.) are unchanged.

After the nav is restructured, we wire two built-but-unregistered modules into it:
**Suppliers** (module #7 — already has route + all backend layers, just needs nav
registration, UI polish confirmation, and its section added to the People & Resources
group) and **Keywords** (module #8 — database procs exist, frontend does not; needs full
frontend layer modelled on the Suppliers pattern).

One module at a time: **Suppliers first**, user approves, then **Keywords**.

---

## Sub-tasks

---

### Task 1 — Grouped disclosure nav component

**Status**: [ ] pending

**Intent**
Replace the current flat `ProjectSectionNav` link row with a grouped disclosure-button
nav. Each group pill is an ARIA `<button>` that toggles a panel of section `<Link>`s.
Clicking a link navigates; clicking a pill only opens/closes its panel. The active group
(whose descendant is the current route) has its pill visually highlighted; the active
section link inside the open panel carries `aria-current="page"`.

**Expected outcomes**
- `projectSections` in `project-sections.ts` is restructured from flat sections to
  `ProjectSectionGroup[]` — each group has `{ label, segments: ProjectSection[] }`.
- `ProjectSectionNav` renders 4 group pills, each with a disclosure panel of links.
- Active group detection: a group is "active" when any of its segments matches the
  current pathname (prefix match).
- Active section detection: individual segment exact/prefix match (same logic as today).
- Pill is highlighted when its group is active OR its panel is open.
- Panel open/close state is client-only (no URL needed); on mount the active group's
  panel opens automatically.
- Keyboard: `Enter`/`Space` toggle panel; `Tab` traverses links inside open panels.
- `aria-expanded` on each pill button; `aria-label` on each group; section links
  unchanged semantics.
- The existing `project-sections.test.ts` passes with the updated structure.
- No new runtime dependencies (no icon package).

**Todo list**
- [ ] Update `project-sections.ts`: change `projectSections` type from
  `ProjectSection[]` to `ProjectSectionGroup[]`; move existing flat entries (`.`,
  `planning`, `people`, `activity`) into a grouped structure and populate each group
  with its known sub-sections (only built ones: for now `.`, `deliverables`,
  `suppliers` under their groups).
- [ ] Update `ProjectSectionNav` to iterate groups, render a `<button>` pill per group,
  toggle `isOpen` state per group (useReducer or per-group state), render a `<ul>` of
  `<Link>` items inside each open panel.
- [ ] Add `isGroupActive(pathname, projectId, group)` helper to `project-sections.ts`.
- [ ] Update `project-sections.test.ts` to test the new group structure.
- [ ] Update `src/lib/messages.ts` to add group labels (or confirm existing
  `planning.title`, `people.title`, `activity.title`, `projects.charterSection` cover
  the 4 groups).
- [ ] Run `npm run lint && npm run typecheck && npm run test`.

**Relevant context**
- `src/components/shell/project-sections.ts` — current flat registry (58 lines)
- `src/components/shell/project-section-nav.tsx` — current flat link row (73 lines)
- `src/components/shell/project-sections.test.ts` — test asserts `[".", "deliverables", "suppliers"]`
- `src/lib/messages.ts` — labels: `planning.title`, `people.title`, `activity.title`,
  `projects.charterSection`
- `src/app/(app)/projects/[id]/layout.tsx` — renders `<ProjectSectionNav projectId>`
- Tailwind tokens in `src/app/globals.css` for active/hover states

---

### Task 2 — Suppliers: nav registration and section audit

**Status**: [ ] pending  
**Depends on**: Task 1

**Intent**
Suppliers already has a full route and backend. This task registers Suppliers in the
People & Resources group of the new nav, verifies the page renders correctly under the
new nav, and resolves the failing test assertion that expected `suppliers` in the flat
registry.

**Expected outcomes**
- `suppliers` segment is registered inside the "People & Resources" group in
  `project-sections.ts`.
- `ProjectSectionNav` shows "People & Resources" pill; clicking it reveals "Suppliers"
  link (and any other people sections built later).
- `/projects/[id]/suppliers` route works end-to-end: list page loads, sheet opens, form
  validates, actions fire correctly.
- `project-sections.test.ts` test for segment list updated to reflect grouped structure.
- `npm run lint && npm run typecheck && npm run test` green.

**Todo list**
- [ ] In `project-sections.ts`, add `{ segment: "suppliers", label: messages.suppliers.title, match: "prefix" }` to the People & Resources group.
- [ ] Confirm `src/app/(app)/projects/[id]/suppliers/page.tsx` exists and renders
  under the layout (no route change needed).
- [ ] Update `project-sections.test.ts` to assert suppliers is in the people group.
- [ ] Run `npm run lint && npm run typecheck && npm run test`.

**Relevant context**
- `src/modules/suppliers/` — full module (schemas, repo, actions, components) ✅
- `src/app/(app)/projects/[id]/suppliers/page.tsx` — route exists ✅
- `db/procs/supplier/` — 5 procs exist ✅

---

### Task 3 — Keywords module: database migration

**Status**: [ ] pending  
**Depends on**: Task 1 approved

**Intent**
The `app.Keyword` table and all 5 stored procedures exist in the database layer. Confirm
the migration covers the Keyword table schema (it lives in `003_domain_schema.sql`) and
that no additional migration is needed before the frontend layer is built.

**Expected outcomes**
- `db/migrations/003_domain_schema.sql` confirmed to include `app.Keyword` table with
  correct columns: `KeywordId`, `ProjectId` (nullable FK), `Acronym`, `Definition`,
  `IsDeleted`, audit cols, `RowVer`.
- All 5 procs in `db/procs/keyword/` confirmed to exist and match the schema.
- No new migration needed; record this as confirmed in the plan notes.

**Todo list**
- [ ] Read `db/migrations/003_domain_schema.sql` Keyword section.
- [ ] Read all 5 procs: `usp_Keyword_Create/GetById/List/Update/Delete`.
- [ ] Confirm schema + procs align (column names, THROW codes, audit log, RowVer cast).
- [ ] Note any gaps (e.g. missing `UpdatedBy`/`DeletedBy`) that need a refinement
  migration before proceeding.

**Relevant context**
- `db/migrations/003_domain_schema.sql` lines ~164–184 (Keyword table)
- `db/procs/keyword/` — 5 proc files already seen
- Pattern: `db/migrations/005_projects_refinements.sql` / `006_stakeholders_refinements.sql`
  as examples if a refinement is needed

---

### Task 4 — Keywords module: schemas and repository

**Status**: [ ] pending  
**Depends on**: Task 3

**Intent**
Build the TypeScript layer for Keywords following the exact same pattern as Suppliers
(the closest existing module). Keywords are simpler: only `Acronym` (required) and
`Definition` (optional). No vocab dropdowns.

**Expected outcomes**
- `src/modules/keywords/schemas/keyword.ts` with:
  - `keywordRowSchema` (mirrors SELECT shape of all 5 procs)
  - `keywordListRowSchema` (extends with `TotalCount`)
  - `createKeywordInput`, `updateKeywordInput`, `deleteKeywordInput` (zod input schemas)
- `src/modules/keywords/schemas/keyword-form.ts` with `keywordFormSchema` and
  `updateKeywordFormSchema` (FormData-friendly, coercion for blank strings → null).
- `src/modules/keywords/schemas/keyword-form.test.ts` with schema validation tests.
- `src/modules/keywords/repository/keywords.ts` with:
  - `createKeyword(input, actorUserId)`
  - `getKeywordById(id, actorUserId)`
  - `listKeywords(params, actorUserId, projectId)`
  - `updateKeyword(input, actorUserId)`
  - `deleteKeyword(input, actorUserId)`
  - All use `execProc()` and parse rows with zod at the boundary.
- `src/modules/keywords/repository/keywords.test.ts` with mocked-execProc unit tests.

**Todo list**
- [ ] Create `src/modules/keywords/schemas/keyword.ts`.
- [ ] Create `src/modules/keywords/schemas/keyword-form.ts`.
- [ ] Create `src/modules/keywords/schemas/keyword-form.test.ts`.
- [ ] Create `src/modules/keywords/repository/keywords.ts`.
- [ ] Create `src/modules/keywords/repository/keywords.test.ts`.
- [ ] Run `npm run lint && npm run typecheck && npm run test`.

**Relevant context**
- `src/modules/suppliers/schemas/supplier.ts` — pattern to follow exactly
- `src/modules/suppliers/schemas/supplier-form.ts` — form schema pattern
- `src/modules/suppliers/repository/suppliers.ts` — repository pattern
- `db/procs/keyword/usp_Keyword_List.sql` — SELECT columns: KeywordId, ProjectId,
  Acronym, Definition, CreatedAtUtc, UpdatedAtUtc, RowVer, TotalCount
- `src/lib/db.ts` — `execProc` import

---

### Task 5 — Keywords module: actions

**Status**: [ ] pending  
**Depends on**: Task 4

**Intent**
Wire the three Server Actions (create, update, delete) for Keywords using the `action()`
wrapper pattern. Permissions follow the RBAC matrix (`keywords:create/update/delete`).

**Expected outcomes**
- `src/modules/keywords/actions/create-keyword.ts`
- `src/modules/keywords/actions/update-keyword.ts`
- `src/modules/keywords/actions/delete-keyword.ts`
- `src/modules/keywords/actions/actions.test.ts` with success + failure paths.
- All 3 actions use `action({ name, schema, permission, handler })`.
- No `revalidate` paths (project-scoped dynamic routes refresh naturally like suppliers).

**Todo list**
- [ ] Create the 3 action files.
- [ ] Create `actions.test.ts`.
- [ ] Confirm RBAC permission strings match the matrix in `src/lib/auth/rbac.ts` (add
  `keywords:create/update/delete` if not present).
- [ ] Run `npm run lint && npm run typecheck && npm run test`.

**Relevant context**
- `src/modules/suppliers/actions/create-supplier.ts` — pattern to follow
- `src/lib/action.ts` — `action()` wrapper
- `src/lib/auth/rbac.ts` — permission matrix (check `keywords` permissions exist)

---

### Task 6 — Keywords module: components

**Status**: [ ] pending  
**Depends on**: Task 5

**Intent**
Build the UI components for Keywords following the Suppliers sheet + DataView pattern:
a `KeywordSheet` (URL-synced `?id=<n>|new`), a `KeywordsView` (DataView), and a
`KeywordsToolbar` (search-only, no filter since there are no vocab dropdowns).

**Expected outcomes**
- `src/modules/keywords/components/keywords-view.tsx` — DataView with columns:
  Acronym (p1, sortable), Definition (p1), CreatedAtUtc (p3).
- `src/modules/keywords/components/keywords-toolbar.tsx` — search toolbar only.
- `src/modules/keywords/components/keyword-sheet.tsx` — Sheet with form fields:
  Acronym (required text), Definition (optional textarea). URL-synced `?id=`.
- Components follow the same client/server split and prop contracts as
  `SupplierSheet` / `SuppliersView` / `SuppliersToolbar`.

**Todo list**
- [ ] Create `keywords-view.tsx` (DataView wrapper with column definitions).
- [ ] Create `keywords-toolbar.tsx` (search-only toolbar).
- [ ] Create `keyword-sheet.tsx` (Sheet + form + action wiring).
- [ ] Run `npm run lint && npm run typecheck`.

**Relevant context**
- `src/modules/suppliers/components/supplier-sheet.tsx` — Sheet pattern
- `src/modules/suppliers/components/suppliers-view.tsx` — DataView pattern
- `src/modules/suppliers/components/suppliers-toolbar.tsx` — toolbar pattern
- `src/components/ui/data-view/` — DataView primitives
- `src/components/ui/form/` — form primitives

---

### Task 7 — Keywords module: page and nav registration

**Status**: [ ] pending  
**Depends on**: Task 6

**Intent**
Create the route page for Keywords under `/projects/[id]/keywords`, register it in the
**Activity** group of the grouped nav (tail position, after financials, same cadence as
notes), and add the Keywords label to `messages.ts`.

**Expected outcomes**
- `src/app/(app)/projects/[id]/keywords/page.tsx` — thin page following suppliers page
  pattern: `parseListParams`, `listKeywords`, `getViewPreference`, `KeywordsView` +
  `KeywordsToolbar` + `KeywordSheet`.
- `src/lib/messages.ts` gains `keywords` section with title, field labels, and copy.
- `project-sections.ts` gains `{ segment: "keywords", label: messages.keywords.title,
  match: "prefix" }` inside the Activity group (after `notes`).
- No 5th Reference group — Notes and Keywords both live in Activity (decided above).
- `project-sections.test.ts` updated to assert keywords is in the activity group.
- `npm run lint && npm run typecheck && npm run test` green.

**Todo list**
- [ ] Add `keywords` messages to `src/lib/messages.ts`.
- [ ] Create `src/app/(app)/projects/[id]/keywords/page.tsx`.
- [ ] Register `keywords` segment inside the Activity group in `project-sections.ts`
  (after `notes`).
- [ ] Update `project-sections.test.ts`.
- [ ] Run `npm run lint && npm run typecheck && npm run test`.

**Relevant context**
- `src/app/(app)/projects/[id]/suppliers/page.tsx` — page pattern
- Activity group order: `meetings` · `activities` · `todos` · `questions` ·
  `parking-lot` · `financials` · `notes` · `keywords` (last)

---

## Notes

### Group membership (ADR-0018 order, currently built sections marked ✅)

| Group | Segments |
|---|---|
| Overview | `.` (charter) ✅ |
| Planning | `objectives`, `deliverables` ✅, `risks` |
| People & Resources | `stakeholders`, `suppliers` ✅, `resources` |
| Activity | `meetings`, `activities`, `todos`, `questions`, `parking-lot`, `financials`, `notes`, `keywords` ✅ (after Task 7) |

**4 groups only** — Notes and Keywords belong to Activity (decided: Notes written
during/after project work; Keywords is a project reference updated as the project
progresses). No 5th Reference group.

### No hub pages

Clicking a group pill opens/closes its dropdown. The user must click a sub-section link
to navigate. There is no `/projects/[id]/planning` hub route.

### Approval gate

User approves after Task 2 (suppliers wired + nav working) before proceeding to Task 3+
(keywords). The plan tracks this with explicit status updates.
