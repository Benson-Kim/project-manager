# ADR-0019 — Project section navigation: grouped disclosure buttons supersede flat scrollable row

Status: Accepted · Date: 2026-10-01 · Supersedes: ADR-0018 decision point 2 (section nav shape only; all other ADR-0018 decisions — nested layout, registry, route segments, DataView convention — remain in force)

## Context

ADR-0018 §2 specified *"one horizontally scrollable row of plain `<Link>`s"* as the section navigation. That design was implemented and then replaced in commit `c1f44af` before any module MR merged, based on the following observations during the layout session:

1. **Capacity** — the section registry already holds 9 entries at the time of the layout MR and will grow to 15–16 when all planned modules land. A single flat row of 15 pills requires roughly 960 px of horizontal space at the chosen pill sizing, creating a very long scroll target on every device.
2. **"Where am I" scent** — an edge-fade affordance is not strong enough to communicate that there are 10+ more sections off-screen on a 360 px phone; usability testing on similar products (PRINCIPLES §4 in the UX research doc) shows users consistently miss sections in rows longer than ~6 items.
3. **ADR-0018 fallback language** — ADR-0018 §Consequences already documented: *"If usability review rejects scroll overflow at desktop widths, the documented fallback is primary 4–5 links + `More` menu at ≥ lg only"*. The grouped disclosure design below is a natural extension of that fallback applied at all widths.
4. **ADR-0018 alternatives** — The "Section switcher dropdown/combobox" was rejected as *primary* navigation but its note says it *"may return later as a header jump-to-section enhancement"*. Grouped disclosures are distinct from a single combobox: each group pill is always visible, the active group is highlighted, and keyboard navigation follows the ARIA disclosure pattern, not a listbox.

## Decision

Replace the flat scrollable `<Link>` row with **grouped disclosure buttons** in `src/components/shell/project-section-nav.tsx`:

1. **Groups** — sections are partitioned into 4 labelled groups drawn from `projectSectionGroups` in `project-sections.ts` (Overview · Planning · People · Activity). Each group renders as a `<button aria-expanded>` pill.
2. **Overflow** — the row of group pills (`<ul class="flex gap-1 overflow-x-auto">`) is itself scrollable at 360 px if all 4 pills do not fit; in practice 4 short labels fit comfortably from 320 px upward. `shrink-0` on each `<li>` prevents text wrapping within a pill.
3. **Disclosure panel** — clicking a group pill opens a positioned panel (`role="group"`) listing that group's section links (`<Link aria-current="page">`). Only one panel is open at a time; clicking outside or navigating closes the active panel.
4. **Active-group highlighting** — the pill for the group that contains the current route is rendered with the accent background on mount and after each route change.
5. **ARIA pattern** — `aria-expanded` on the button, `aria-controls` pointing to the panel id, `role="group"` + `aria-label` on the panel. This follows the WAI-ARIA disclosure pattern (distinct from `tablist`, which ADR-0018 already rejected for same-page panels).
6. **Single-section group** — a group with exactly one section whose segment is `"."` (Overview) renders as a plain `<Link>` pill (no disclosure needed for a single destination).
7. **Section registry** — `project-sections.ts` continues to maintain both `projectSections` (flat list, consumed by `isCurrentSection`) and `projectSectionGroups` (grouped list, consumed by the nav). Modules append to `projectSections`; the group assignment is the `filter` predicate in `projectSectionGroups`.

### What stays the same from ADR-0018

- Nested layout, `getProjectCached`, `notFound()` guard — unchanged.
- `ProjectHeader`, breadcrumb, page `h1` via `PageHeader` — unchanged.
- Route segments (`.`, `objectives`, `deliverables`, etc.) — unchanged.
- Section registry contract (`{ segment, label, match }`) — unchanged.
- `aria-current="page"` on the active section link — unchanged.
- No `tablist`; plain `<Link>` elements inside the panel — unchanged.
- `min-h-10` shell sizing scale — unchanged.

## Consequences

- The nav stays compact at every viewport as more sections are added; all 15+ sections remain reachable in ≤ 2 clicks.
- The active group pill provides persistent "where am I" context even when the current section's name is not visible.
- Keyboard users can Tab to the active group pill, press Enter/Space to open the panel, and Tab/Arrow through the section links.
- Close-on-outside-click (`pointerdown` listener) requires the nav to be a client component (`"use client"`); this is acceptable — the nav carries no data, only pathname state.
- `project-sections.test.ts` continues to cover `isCurrentSection`, `isGroupActive`, and `sectionHref`; no new test surface is introduced that the existing suite does not already exercise.
- A superseding ADR is required to revert to the flat row or adopt a different primary navigation shape — not a silent commit.
