# ADR-0018 — Project workspace navigation: nested layout + scrollable section links

Status: Partially superseded · Date: 2026-09-16 (proposed and accepted) · Session: UX research (#29);
accepted in the layout MR
[!14](https://gitlab.com/shnie/projectmanager/-/merge_requests/14)

> **Decision point 2 (section nav shape) is superseded by [ADR-0019](ADR-0019-project-section-nav-grouped-disclosure.md).**
> All other decisions in this ADR (nested layout, registry, route segments, DataView convention) remain in force.

Full research (inventory, comparison matrix, wireframes, a11y/mobile spec):
[`docs/ux/project-workspace-navigation.md`](../ux/project-workspace-navigation.md).

## Context

Requirement 0.1 scopes the menu to the selected project; PLAN §2/§3 and issues #6–#24
put 13–16 sections inside every project (charter, objectives, deliverables+Gantt,
risks/assumptions, stakeholders, suppliers, IT resources, meetings, activities,
to-dos, Q&A, parking lot, financials, notes, keywords). The product owner has ruled
that **two sidebars are not an option**, and the #28 shell spec fixes the single
sidebar's content to global items (Dashboard, Projects, Daily activities, To-do
lists, Reports, Settings, Logout). Modules must reuse DataView , the list
proc contract (ADR-0016) and the Sheet/full-route split (ADR-0010); every screen must
be deep-linkable for multi-window use; mobile-first at 360 px.

## Decision

1. **Nested layout** `src/app/(app)/projects/[id]/layout.tsx` (server component):
   validates the id, fetches the project once, renders `ProjectHeader` (project name,
   status/priority badges) + `ProjectSectionNav` + `{children}`; `notFound()` when
   missing/deleted. The shell header title becomes the breadcrumb
   `Projects / <project name>` inside the workspace; the page `h1` stays the section
   name via `PageHeader`.
2. ~~**Section navigation** = one horizontally scrollable row of plain `<Link>`s in
   `<nav aria-label="Project sections">`, `aria-current="page"` on the active section
   (exact match for the index, prefix match for sections), edge-fade overflow
   affordance, identical at 360 px and desktop.~~ **Superseded by [ADR-0019](ADR-0019-project-section-nav-grouped-disclosure.md)**: grouped disclosure buttons replace the flat row. Links (not ARIA tabs) and `aria-current="page"` are unchanged. No sidebar swap; the global sidebar is untouched inside a project.
3. **Routes**: every section is a full route `/projects/[id]/<segment>`; the charter
   remains the index `/projects/[id]`. Segments (ordered by task group):
   `.` charter · `objectives` · `deliverables` (+`/gantt`) · `risks` (merged
   risks/assumptions) · `stakeholders` · `suppliers` · `resources` · `meetings`
   (+`/[meetingId]`) · `activities` · `todos` · `questions` · `parking-lot` ·
   `financials` · `notes` · `keywords`.
4. **Section registry** `src/components/shell/project-sections.ts` mirrors
   `nav-items.ts`: `{ segment, label(messages), match: "exact" | "prefix" }`; a module
   session appends its entry when its section page lands — unbuilt sections do not
   appear (no placeholders in the section nav).
5. **Lists**: section list pages render DataView unchanged with `@ProjectId` forced
   into the list proc (ADR-0016). Daily activities and to-dos exist BOTH as global
   sidebar routes and as project-filtered sections over the same proc/DataView.
6. **Rollout**: a small dedicated MR `feat(projects): project workspace nested layout
   + section navigation` (layout, ProjectHeader, ProjectSectionNav, registry with
   Charter, axe + e2e + 360 px tests) lands **before module #6 merges**, or
   immediately after (moving #6's routes in the same MR). The MR also verifies the
   ADR-0009 unsaved-changes guard intercepts client-side Link navigation (open
   question Q1 in the research doc).

### Convention text to add to `docs/MODULE-BLUEPRINT.md` when this ADR is accepted

(Do not edit the blueprint in the research MR; the layout MR adds this verbatim.)

> **Project-scoped modules — ProjectSectionLayout convention.** A module whose data
> hangs off `ProjectId` ships its screens under
> `src/app/(app)/projects/[id]/<segment>/` (segment per ADR-0018), NOT as a top-level
> route. Do not fetch the project or render a project header — the shared
> `projects/[id]/layout.tsx` does both. Register the section by appending to
> `src/components/shell/project-sections.ts` (label from `messages.ts`). The list
> page renders `DataView` with the module's list proc scoped by `@ProjectId`; the
> page `h1` (via `PageHeader`) is the section name and carries the primary action.
> Global-also modules (daily activities, to-dos) additionally keep their global route
> registered in `nav-items.ts`, reusing the same DataView/proc without the project
> filter.

## Consequences

- One navigation implementation for 15+ modules; zero changes to the #28 shell; the
  single-sidebar ruling is satisfied unambiguously (no mode switching).
- Existing charter deep links survive; every section is deep-linkable and
  multi-window-safe by construction (plain GET routes).
- Nav is RSC + static links: no client bundle growth, `<Link>` prefetch keeps
  section switching fast.
- Nav pills use the shell sizing scale (`min-h-10`, #28) rather than the 44 px content
  rule — STANDARDS §5.3 needs a one-line clarification when this ADR is accepted.
- `feature/stakeholders` must place its routes under `projects/[id]/stakeholders/`
  (or accept a mechanical move in the layout MR) — coordination tracked in #29.
- If usability review rejects scroll overflow at desktop widths, the documented
  fallback is primary 4–5 links + `More` menu at ≥ lg only (a superseding ADR is not
  needed; it is a parameterisation of the same nav component).

## Alternatives considered

- **Contextual sidebar swap** (single sidebar switches to project sections inside a
  project): rejected — destroys global wayfinding (NN/g local-navigation guidance;
  GitLab retired this pattern with its 16.0 unified sidebar), conflicts with the
  in-flight `feature/app-shell-navigation` branch, and violates the PO's
  single-sidebar ruling in spirit.
- **Section switcher dropdown/combobox** (Linear-style breadcrumb switcher): rejected
  as primary — hides all 15 sections behind a click (recognition over recall), weak
  "where am I" scent; may return later as a header jump-to-section enhancement.
- **Segmented tabs (4–5 primary + More)**: rejected as primary — `More` becomes the
  real nav for 10+ sections and the active-item-inside-More state is confusing; kept
  as the ≥ lg fallback above.
- **Project overview hub page with section cards**: rejected as the navigation
  mechanism (every switch costs an extra hop and wayfinding dies after leaving the
  hub); a dashboard-style hub can still be added later as content, not navigation.
- **Mobile bottom bar of project sections**: rejected — capacity caps at ~5 (Apple
  HIG), and #28 already replaced the bottom tab bar with a drawer; two persistent
  bars would contradict the shell spec.
