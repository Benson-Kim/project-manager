# Project workspace navigation — research and design

Status: research complete, decision proposed in
[ADR-0018](../adr/ADR-0018-project-workspace-navigation.md) · Date: 2026-09-16 ·
Related: epic #1, shell issues #25/#28, requirement 0.1 (menu scoped to the selected
project), STANDARDS §5.3, ADR-0006/0009/0010/0016.

## Summary

Every project carries 13–16 project-scoped sections; the product owner has ruled out a
second sidebar. Recommendation: a **nested App Router layout at
`src/app/(app)/projects/[id]/layout.tsx`** rendering a shared **project header** (name,
status/priority badges, back-to-projects breadcrumb) and a **horizontally scrollable
section navigation** of plain links (`aria-current="page"`), grouped and ordered by
task frequency, identical at 360 px and desktop. The single global sidebar (#28 spec)
stays untouched in project context. Each section is a full deep-linkable route
(`/projects/[id]/<section>`) whose list pages reuse DataView unchanged. The header
type-ahead (req 0.2) remains the fast path across projects; a "jump to section" is a
later enhancement, not a dependency. Rollout: one small dedicated MR introducing the
layout + nav before module #6 (stakeholders) lands.

## Inventory — project-scoped vs global sections

Sources: `docs/PLAN.md` §2/§3, issues #5–#24, `docs/source/analysis/requirements.md`
(req 0.1: "menu items linked to one project").

| # | Section | Issue | Group (task) | Frequency (from Access usage + checklist) |
|---|---|---|---|---|
| 1 | Charter (framework/financing/assignees — built) | #5 | Planning | High — the anchor screen |
| 2 | Objectives | #10 | Planning | Low after kickoff |
| 3 | Key deliverables (+ Gantt) | #9 | Planning | Medium — drives Gantt |
| 4 | Assumptions & constraints | #13 | Governance | Low |
| 5 | Risks & issues (UI merged with #13 per checklist §16) | #14 | Governance | Medium |
| 6 | Stakeholders | #6 | People | Medium — feeds meeting participants, deliverable assignees |
| 7 | Suppliers | #7 | People | Low |
| 8 | IT resource planning | #16 | People/Execution | Low (5 fixed categories) |
| 9 | Meetings (agenda/discussion/actions/participants) | #11 | Execution | High — recurring |
| 10 | Q&A | #12 | Execution | Medium |
| 11 | Daily activities (project-filtered view of the global list) | #19 | Execution | High — daily |
| 12 | To-dos (project-filtered; alerts are global) | #20 | Execution | High — daily |
| 13 | Parking lot | #18 | Execution | Medium |
| 14 | Notes (rich text, tabs) | #15 | Reference | Medium |
| 15 | Keywords (keywords) | #8 | Reference | Low — lookup |
| 16 | Financials (+ MSSS document checklist) | #17 | Money | Medium, bursty |

`ExistingSystemInterface` has a table in PLAN §2 but no module issue; it belongs
inside IT resource planning or the charter (open question Q4 below). Global sections
(sidebar, per #28): Dashboard, Projects, Daily activities (across projects), To-do
lists (across projects), Reports, Settings, Logout. Daily activities and to-dos are
deliberately BOTH: global list in the sidebar, project-filtered section in the
workspace (the Access app's most-used screens; req checklist rows 34/13).

Count: **16 project-scoped sections** at full build-out (14 nav entries once
risks+assumptions merge and Gantt nests under deliverables).

## Constraints

- Single sidebar only (PO ruling); the #28 sidebar content is fixed and global.
- Mobile-first 360 px; touch targets ≥ 44 px in content, ≥ 40 px in the shell (#28).
- Every screen deep-linkable; several projects open in several windows (checklist
  "Items to remember"; charter page already documents this).
- DataView is mandatory for every list ; URL is the list state — section
  navigation must not clobber `?q=&sort=&view=&page=`.
- Detail/edit = Sheet, except the six full-route exceptions (ADR-0010): charter,
  meeting workspace, notes editor, financial workflow, Gantt, reports.
- RSC-first: no client mega-bundle for navigation; the nav is static links.
- No hints/helper text/tooltips (STANDARDS §5.1); labels must self-explain.
- No icon package exists in `package.json` (a new runtime dep needs an ADR per
  ADR-0014); the shell uses inline SVGs — the section nav follows suit.

## Candidate patterns and comparison

Evaluated candidates:

- **(a) Scrollable section tabs** under a project header inside a
  `/projects/[id]/*` nested layout; overflow = natural horizontal scroll with
  edge-fade affordance (GitHub repo tabs, Material 3 scrollable tabs, GOV.UK
  sub-navigation).
- **(b) Section switcher dropdown/combobox** in a breadcrumb (Linear/GitLab style):
  one visible control, sections revealed on demand.
- **(c) Segmented tabs: 4–5 primary + `More` menu** (Ant Design/Atlassian overflow
  tabs).
- **(d) Project overview hub page** with 16 section cards + counts; every navigation
  passes through the hub.
- **(e) Contextual sidebar swap** — the single sidebar switches to project sections
  inside a project with a back-to-global affordance (GitLab pre-16.0 contextual nav).
- **(f) Command palette / jump-to-section** via the existing header type-ahead.
- **(g) Mobile bottom bar** with top project sections.

| Criterion | (a) scroll tabs | (b) switcher | (c) tabs+More | (d) hub | (e) sidebar swap | (f) palette | (g) bottom bar |
|---|---|---|---|---|---|---|---|
| Discoverability of all 16 | ● good (visible row, scroll affordance) | ○ poor (hidden until click) | ◐ split (More hides 11) | ● good but slow | ● good | ○ poor (recall, not recognition) | ○ poor (4–5 max) |
| Wayfinding / "where am I" | ● `aria-current` pill in context | ◐ label only | ◐ fails when current is in More | ○ lost after leaving hub | ◐ global context lost (why GitLab abandoned it in 16.0) | ○ none | ◐ |
| Scales to 16 sections | ● (scroll; grouping via order) | ● | ○ More becomes the real nav | ● | ◐ very tall, scrolls | ● | ○ hard cap |
| 360 px ergonomics | ● one-row swipe (familiar from GitHub/X mobile) | ● compact | ◐ More menu fiddly | ◐ extra hop each switch | ○ drawer-in-drawer with #28 | ◐ keyboard-first | ● thumb zone but capacity fails |
| A11y | ● plain links, no ARIA weight | ◐ combobox semantics for nav is unusual | ◐ menu + tab mix | ● links | ◐ focus/context jumps | ○ screen-reader discoverability | ◐ |
| Deep links / multi-window | ● routes | ● routes | ● routes | ● routes | ● routes | n/a | ● routes |
| Fit with #28 shell | ● zero shell changes | ● zero | ● zero | ● zero | ✗ rewrites the shell mid-flight, arguably violates the PO ruling in spirit | ◐ extends header search | ✗ #28 replaced the bottom bar with a drawer |
| Impl. cost vs codebase | ◐ one layout + one nav component | ◐ same + combobox | ◐ same + overflow logic (resize observation, client JS) | ◐ + hub page | ● highest, conflicts with `feature/app-shell-navigation` | ◐ search scope work | ● high, contradicts shell |
| STANDARDS/ADR consistency | ● §5.3 one anatomy; ADR-0006 untouched | ● | ◐ | ◐ adds a second list idiom | ○ | ◐ | ○ |

**Decision: (a)**, with (d) reduced to *section links exposed on the charter page later
if wanted* and (f) as a follow-up enhancement. (c) is the documented fallback if user
testing shows scroll-overflow failure at ≥ lg widths (unlikely: at 1280 px ~10–12
labels fit; scroll covers the rest). (e) is rejected: even as "one sidebar that
swaps", it destroys global wayfinding (Nielsen Norman Group's local-navigation
guidance: keep global nav persistent; GitLab's 16.0 redesign consolidated away from
exactly this pattern), and it would collide with the in-flight
`feature/app-shell-navigation` branch. (g) is rejected: #28 already replaced the
bottom tab bar with a drawer; a project bottom bar would reintroduce a second
persistent nav surface.

## Recommendation

One pattern everywhere: **project header + scrollable section link row**, rendered by
a server component in the nested layout. Same DOM at every width; only spacing
changes. No JS beyond Next `<Link>` prefetching.

Desktop (≥ md):

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Global sidebar #28]│ Header: Projects / DME rollout        🔔 ☀ (avatar)│
│  Logo               ├────────────────────────────────────────────────────┤
│  [New project]      │ DME rollout   [In progress] [Priority: High]       │
│  Dashboard          │ ┌────────────────────────────────────────────────┐ │
│  Projects  ◀ active │ │Charter Objectives Deliverables Risks Stakehold…│ │ ← scrolls,
│  Daily activities   │ └────────────────────────────────────────────────┘ │   edge fade
│  To-do lists        │ h1: Stakeholders            [Add stakeholder]      │
│  Reports            │ [Toolbar: search filter sort view-toggle]          │
│  ⸻ Settings, Logout │ [DataView grid/list ...]                           │
└──────────────────────────────────────────────────────────────────────────┘
```

Mobile (360 px — sidebar is the #28 drawer, closed):

```
┌────────────────────────────┐
│ ☰  Projects / DME rollout 🔔│
├────────────────────────────┤
│ DME rollout                │
│ [In progress] [High]       │
│ ◄ Charter Objectives Deli… │  ← swipeable link row, active pill,
├────────────────────────────┤    edge fade signals more
│ h1 Stakeholders     [Add]  │
│ [toolbar]                  │
│ [cards ...]                │
└────────────────────────────┘
```

Section order (grouped by task; separators are visual gaps, not headings):

| Order | Label | Route segment | Inline SVG glyph (Heroicons-style name) |
|---|---|---|---|
| 1 | Charter | `.` (index) | `document-text` |
| 2 | Objectives | `objectives` | `flag` |
| 3 | Deliverables | `deliverables` (Gantt: `deliverables/gantt`) | `chart-bar` |
| 4 | Risks | `risks` (merged risks/assumptions, `?type=` filter) | `exclamation-triangle` |
| 5 | Stakeholders | `stakeholders` | `users` |
| 6 | Suppliers | `suppliers` | `building-office` |
| 7 | Resources | `resources` (IT resource planning) | `server` |
| 8 | Meetings | `meetings` | `calendar` |
| 9 | Activities | `activities` | `clock` |
| 10 | To-dos | `todos` | `check-circle` |
| 11 | Q&A | `questions` | `question-mark-circle` |
| 12 | Parking lot | `parking-lot` | `pause-circle` |
| 13 | Financials | `financials` | `banknotes` |
| 14 | Notes | `notes` | `pencil-square` |
| 15 | Keywords | `keywords` | `tag` |

Icons are optional polish (inline SVG only — no icon dependency exists and adding one
requires an ADR-0014 decision); labels are always visible. Until a module lands, its
link simply is not registered — no dead links, no placeholders in the section nav
(the honest-placeholder rule in #28 applies to the global sidebar only).

## Route and layout structure

```
src/app/(app)/projects/[id]/
  layout.tsx                 ← ProjectSectionLayout (server): validates id,
  │                            fetches project once (getProjectById), renders
  │                            <ProjectHeader> + <ProjectSectionNav> + {children};
  │                            notFound() on missing/deleted project
  page.tsx                   ← Charter (existing, unchanged content)
  stakeholders/page.tsx      ← DataView + Sheet (ADR-0010 default)
  suppliers/page.tsx         …one folder per section, thin pages per ADR-0001
  meetings/page.tsx
  meetings/[meetingId]/…     ← meeting workspace (ADR-0010 full-route exception)
  deliverables/gantt/…       ← Gantt (exception)
  notes/…, financials/…      ← exceptions
```

- **The charter stays the index** (`/projects/[id]`): existing deep links and
  ADR-0010 wording survive; "Charter" is simply the first nav item.
- The layout fetches the project **once**; section pages receive `params.id` and do
  their own list fetch via their repository. React `cache()` dedupes
  `getProjectById` if a section page also needs it. All RSC — the nav is static
  links; the only client code is the existing shell.
- **Header/breadcrumb**: the shell header title (page title left, per #28) becomes
  `Projects / <project name>` inside the workspace — the breadcrumb "Projects" links
  to `/projects` (back affordance). The **`h1` on each page is the section name**
  via the existing `PageHeader`, keeping one `h1` per page (STANDARDS §8) and the
  primary action slot ("Add stakeholder"). `document.title`:
  `<Section> — <Project> — Project Manager` (the shell announcer already reads it).
- **DataView per section**: every list section forces `ProjectId` into its list proc
  call (ADR-0016 `@ProjectId` param); toolbar search/filter/sort/view-toggle work
  unchanged; view preference keys stay per module (`stakeholders`, not
  per-project). URL list state lives per section route, so switching sections
  naturally resets it and back-button restores it.
- **Global sidebar inside a project**: unchanged — `Projects` stays highlighted
  (path-prefix match), `New project` stays visible per RBAC. No mode switch.
- **Deep links/multi-window**: every section is a plain GET route; two windows on
  two projects (or charter + activities of one project) need no extra work.
- **Unsaved-changes guard**: section links are client-side navigations, which
  `beforeunload` does NOT intercept — the ADR-0009 dirty-form guard must hook Link
  navigation (the existing guard's mechanism; verified as open question Q1 if it
  only covers `beforeunload` today).

## Accessibility spec

- Landmark: `<nav aria-label="Project sections">` inside `<main>`'s header block —
  distinct label from the global sidebar's `aria-label` (WCAG 2.4.1 / ARIA
  landmarks must be distinguishable).
- **Plain links, not ARIA tabs**: WAI-ARIA Authoring Practices reserve
  `role="tablist"` for same-page panel switching; navigation between URLs must be
  links so SR users get link semantics, middle-click, and history. `aria-current="page"`
  on the active section (matches the existing sidebar implementation).
- Active-link match: exact for the index (`/projects/123`), prefix for sections
  (`/projects/123/meetings/45` keeps Meetings current).
- Natural tab order (no roving tabindex — the row is links, not a widget);
  `focus-visible` ring per tokens; on focus the browser scrolls the link into view
  (ensure no `overflow: hidden` clipping — use `overflow-x-auto`).
- Scroll affordance: CSS edge fade (mask) at both ends when scrollable;
  `scrollbar-width: thin` on desktop hover. No scroll-buttons widget (adds JS and
  tab stops for no gain; swipe + Tab reach everything).
- Skip link order unchanged (`#main` is the layout's parent); the section nav is
  inside `main`, after the project header, so skip-to-content lands above it —
  acceptable because the nav is short to traverse; revisit if testing shows pain.
- Route changes announced by the existing shell announcer via `document.title`.
- Touch targets: `min-h-10` per #28 shell sizing for the pills (40 px, shell-scale),
  with ≥ 8 px gaps; 44 px rule (STANDARDS §5.3) applies to content, shell-scale
  applies to nav chrome — flagged in the ADR so #28 and STANDARDS stay consistent.
- States: the layout has its own `loading.tsx` (project header skeleton) and
  `error.tsx`/`notFound` per STANDARDS §7; section pages keep their own
  skeleton/empty/zero-result/error states via DataView .

## Mobile spec (360 px)

- Same component: one-row horizontally scrollable link row under the project
  header; active pill uses `bg-accent-soft text-accent` (token pairing already
  contrast-verified). Scroll position snaps the active pill into view on load
  (`scrollIntoView({ inline: "nearest" })` in a tiny client effect or CSS
  `scroll-snap` — implementation detail for the layout MR).
- Project header collapses to two lines: name (truncated, full name in the charter),
  badges row. Section `h1` + primary action below, sticky toolbar per §5.3.
- The #28 drawer keeps only global items — opening it from a section does not lose
  the section (drawer overlays, URL unchanged).
- No bottom bar (see candidate (g) rejection). To-do alerts arrive via the global
  bell (#28), not project nav.

## Implications and rollout

- **App-shell MR (#25/#28): no changes required.** The only touchpoint is the header
  title becoming a `Projects / <name>` breadcrumb inside `/projects/[id]/*` — the
  shell already renders a per-page title; the layout supplies it. If the shell
  hardcodes titles per top-level route, a one-line follow-up in the layout MR fixes
  it. Explicitly: the global sidebar does NOT swap, satisfying the single-sidebar
  ruling with zero ambiguity.
- **Module sessions #6–#24**: each project-scoped module creates
  `src/app/(app)/projects/[id]/<segment>/page.tsx` (instead of a top-level
  `/(app)/<module>/` route), registers its section in the section registry
  (`src/components/shell/project-sections.ts`, mirroring `nav-items.ts`), and keeps
  everything else per MODULE-BLUEPRINT. Exact convention text is in ADR-0018 —
  MODULE-BLUEPRINT is NOT edited in this MR (docs-only, blueprint owned by module
  work).
- **Global-also modules**: daily-activities (#19) and todo-alerts (#20) ship the
  global route (sidebar) AND the project section as a pre-filtered view of the same
  DataView + proc (`@ProjectId`), per req 0.1 + checklist row 13.
- **Phased rollout**: one small dedicated MR `feat(projects): project workspace
  nested layout + section navigation` — layout, ProjectHeader, ProjectSectionNav,
  section registry with the single existing entry (Charter), tests (axe, e2e
  navigation, 360 px) — **before module #6 (stakeholders) merges**. Reason: #6 is
  in flight on `feature/stakeholders`; if it lands routes at
  `/(app)/stakeholders`, they must be moved and re-tested (rework + broken deep
  links). If #6 merges first, the layout MR follows immediately and #6's routes are
  moved in that MR (small, mechanical). Either way the convention exists before
  modules #7+ start.

## Risks and open questions

| # | Risk / question | Proposed owner |
|---|---|---|
| Q1 | Does the ADR-0009 unsaved-changes guard intercept client-side Link navigation (not just `beforeunload`)? Section switching makes this hot. | **Resolved (MR !14)**: it did not — the guard was `beforeunload` + the Cancel button only. `useUnsavedChangesGuard` now intercepts internal link clicks at the document capture phase (pure logic unit-tested in `unsaved-guard.test.ts`); `ProjectForm` adopted it. |
| Q2 | 15 links at 1280 px: is scroll-overflow acceptable to the PO, or is (c) primary+More wanted at ≥ lg? Decide after first usability pass with seeded data. | new UX issue; PO |
| Q3 | `feature/stakeholders` may land `/(app)/stakeholders` top-level routes before the layout MR. Coordinate the move. | **Resolved (MR !14)**: MR !11 was still open when the layout landed — nothing registered for stakeholders; comment posted on !11/#6 asking for `projects/[id]/stakeholders/` per ADR-0018. |
| Q4 | `ExistingSystemInterface` has no module issue — charter field group or resources section? | #16 (it-resource-planning) |
| Q5 | Shell-scale 40 px vs STANDARDS 44 px touch targets for nav pills needs a one-line STANDARDS clarification when ADR-0018 is accepted. | **Resolved (MR !14)**: STANDARDS §5.3 clarified — nav/shell controls use the 40 px shell scale (`min-h-10`); `min-h-11` applies to non-button interactive rows in content. |
| Q6 | Header search doubling as jump-to-SECTION (candidate f) — worth it after ≥ 8 sections exist. | future enhancement issue |

## Sources

Cited by title (workspace proxy blocks the web; no URLs fabricated):

- Nielsen Norman Group — "Tabs, Used Right"; "Local Navigation Is a Valuable
  Design Pattern"; "Breadcrumbs: 11 Design Guidelines for Desktop and Mobile";
  "Mobile Subnavigation".
- W3C WAI-ARIA Authoring Practices Guide — Tabs pattern (tabs vs navigation
  links), Landmark regions.
- Material Design 3 — Tabs (scrollable tabs), Navigation drawer.
- Apple Human Interface Guidelines — Tab bars (capacity limits).
- GOV.UK Design System — Sub navigation / secondary navigation patterns.
- GitHub repository tab navigation (scrollable secondary nav in practice);
  GitLab 16.0 unified single sidebar (retiring contextual sidebar swap);
  Linear breadcrumb switcher; Notion sidebar (rejected patterns' references).
- This repo: `docs/STANDARDS.md` §5.3/§6/§8, ADR-0001/0006/0009/0010/0016,
  issues #5–#28, `src/components/shell/`, `src/app/(app)/projects/[id]/page.tsx`.
