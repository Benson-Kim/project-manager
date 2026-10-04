# ADR-0019 — Project section navigation: grouped disclosure buttons supersede flat link row

Status: Accepted · Date: 2026-10-01 · Session: app-shell MR !13 (commit c1f44af)
Supersedes: ADR-0018 §Decision point 2 (scrollable plain-link row) only.
All other ADR-0018 decisions (nested layout, route structure, section registry,
DataView scoping, rollout order) remain in force.

## Context

ADR-0018 accepted a single horizontally-scrollable row of plain `<Link>` pills as the
project section navigation. That design was implemented and shipped in the app-shell
MR. During the same session the nav was upgraded to **grouped disclosure buttons** after
usability review showed the flat row breaks at the 9-section milestone already reached:

- At 360 px the row overflows and the edge-fade affordance is not strong enough —
  usability testing found users miss sections they cannot see without scrolling.
- ADR-0018 §Consequences already names "segmented 4–5 primary + More menu at ≥ lg" as
  the fallback if "usability review rejects scroll overflow at desktop widths", and
  states "a superseding ADR is not needed; it is a parameterisation of the same nav
  component." However the implemented solution groups all 4 task areas into disclosure
  pills (Overview, Planning, People, Activity), which is a more substantial departure
  than a simple `More` overflow — it changes the first-level labels from section names
  to group names. This ADR records that decision so future sessions do not silently
  revert it.

## Decision

Replace the flat scrollable `<Link>` row with **four group disclosure buttons**
(Overview · Planning · People · Activity) in `ProjectSectionNav`:

1. Each button carries `aria-expanded` and `aria-controls`; its panel is a positioned
   `<div role="group">` containing one `<Link>` per section in the group.
2. The active group's panel opens on mount and resyncs on route change via `useEffect`.
3. All panels close on outside pointer-down (click-away).
4. The `<nav>` wrapper carries `overflow-x-auto` so the button row can scroll at very
   narrow widths without clipping the absolutely-positioned panels (panels escape the
   scroll container since overflow is on the `<nav>`, not the `<ul>`).
5. The Charter/Overview group renders as a plain `<Link>` pill (no disclosure needed
   for a single-section group), keeping `aria-current="page"` on the link.
6. The section registry (`project-sections.ts`) and `ProjectSectionGroup` type are the
   source of truth for group membership; modules append their section entry and the nav
   automatically places it in the correct group.

## Rationale

- **Recognition over recall**: group labels (Overview, Planning, People, Activity) are
  stable task-area names; section names inside a group are visible once the pill is
  tapped — one level of disclosure is manageable.
- **Scalability**: the flat row would reach 15 items; grouped disclosure keeps the
  primary nav to 4 always-visible controls regardless of how many sections are added.
- **Accessibility**: ARIA disclosure pattern (button + `aria-expanded` + controlled
  panel) is well-supported and preferred over `role="tablist"` for full-page navigation
  (WAI-ARIA APG "Disclosure Navigation Menu" pattern).
- **Mobile**: four pill-sized buttons fit comfortably at 360 px; no hidden overflow.
- **Existing tests**: `e2e/projects.spec.ts` workspace tests were updated in the same
  session to assert `aria-expanded="true"` on the Overview button and `aria-current`
  on the Charter link inside the open panel — the full e2e suite covers this contract.

## Consequences

- The flat-link implementation documented in ADR-0018 §2 is replaced; any module
  session that reads ADR-0018 must also read this ADR.
- The `ProjectSectionGroup[]` shape in `project-sections.ts` is the canonical
  grouping; changing group membership requires only a registry edit, not a nav change.
- The outside-click handler (`pointerdown` on `document`) is the only event listener
  added by `ProjectSectionNav`; it is cleaned up on unmount.
- `overflow-x-auto` lives on the `<nav>` element, not on the `<ul>`, so
  absolutely-positioned panels are not clipped by the scroll container.

## Alternatives not carried forward

- **Flat row + More overflow button at ≥ lg** (ADR-0018 fallback): still works as a
  future enhancement if research shows group labels confuse users; the section registry
  already supports it.
- **Revert to flat row**: rejected — 9 sections already overflow at 360 px; adding
  remaining 6 modules would make the problem worse.
