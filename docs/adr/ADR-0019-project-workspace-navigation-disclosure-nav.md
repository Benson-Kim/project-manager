# ADR-0019 — Project workspace navigation: grouped disclosure nav (supersedes ADR-0018 §2)

Status: Accepted · Date: 2026-10-02 · Supersedes: ADR-0018 decision point 2 (section navigation style only)

## Context

ADR-0018 decision point 2 specified "one horizontally scrollable row of plain `<Link>`s".
After the layout MR (!14) landed, the key-deliverables module (MR !17) introduced
grouped disclosure buttons as the project section navigation: four groups
(Overview · Planning · People · Activity), each with a disclosure panel of section
links. This change was committed without a superseding ADR, which Codex review
comment C7 (PR #17) correctly flagged as a compliance gap.

The grouping arose from a real usability need: with 13–16 sections the flat pill row
overflows on 360 px even with `overflow-x-auto` (the pills are hidden and discovery
depends on noticing the horizontal scroll indicator). The grouped disclosure keeps
the nav to four visible buttons on any viewport width, while retaining every section
as a deep-linkable plain `<Link>` inside the panel.

ADR-0018 §5 ("Alternatives considered") explicitly rejected a "Section switcher
dropdown/combobox" as the **primary** navigation and noted "may return later as a
header jump-to-section enhancement." The grouped disclosure adopted here is
different: the four group buttons are always visible and the panels are persistent
deep-linked `<Link>`s, not a combobox or a single-item selector. The concern in
ADR-0018 was about a single dropdown hiding all sections; here each group exposes 2–4
section links with no nesting beyond one level.

## Decision

Replace ADR-0018 decision point 2 with the following:

**Section navigation** = `ProjectSectionNav` client component with four named group
buttons (Overview · Planning · People · Activity). Each button is an `aria-expanded`
disclosure toggle. The active group's panel opens automatically on load and on route
change. Panels contain plain `<Link>`s with `aria-current="page"` on the active
section. The pill row scrolls horizontally only if a group label overflows; the panels
are rendered outside the scroll container (siblings of the `<ul>`) so they are never
clipped. The component remains at `src/components/shell/project-section-nav.tsx`;
the section registry remains at `src/components/shell/project-sections.ts`.

All other ADR-0018 decisions (nested layout, deep-linkable routes, DataView in section
pages, MODULE-BLUEPRINT convention text, section registry, unsaved-changes guard)
remain accepted and unchanged.

### Group assignments

| Group | Sections |
|-------|----------|
| Overview | Charter (index) |
| Planning | Objectives · Deliverables · Q&A · Assumptions & constraints · Risks |
| People | Stakeholders · Suppliers |
| Activity | Daily activities · To-dos · Keywords · Parking lot · Financials · Notes |

New modules register under the group that best matches their domain. Modules with
zero built sections are suppressed automatically (no placeholders).

### Accessibility contract

- Group button: `role="button"`, `aria-expanded`, `aria-controls="section-group-<key>"`
- Panel: `role="group"`, `aria-label="<group label>"`, rendered outside the
  scroll container (position:absolute, anchored to `<nav>`)
- Section links inside panel: plain `<Link>`, `aria-current="page"` when active
- Exception: a group with exactly one section whose segment is "." renders as a
  plain `<Link>` pill (no disclosure needed for a single Charter link); see
  `GroupTrigger` in `project-section-nav.tsx`

### z-index

The `<nav>` and its disclosure panels use `--z-dropdown` (55). The layout wrapper
`<div>` enclosing `ProjectSectionNav` must carry NO z-index declaration so that
Sheet and Dialog overlays (`--z-dialog: 50`) correctly dim the nav when open.

## Consequences

- The e2e workspace test must be updated to match the disclosure contract:
  Charter renders as a plain link (single-section Overview group); Planning /
  People / Activity render as `aria-expanded` buttons.
- The MODULE-BLUEPRINT section-navigation convention text from ADR-0018 is updated
  to reference `ProjectSectionNav` with group registration rather than appending
  a flat `<Link>`.
- ADR-0018 remains on record as the accepted baseline; this ADR is narrowly scoped
  to point 2 of its decision section.

## Alternatives considered

- **Revert to flat scrollable links (pure ADR-0018 compliance)**: retains simplicity
  but does not solve the 360 px overflow problem as sections grow beyond 8. Rejected.
- **Primary 4–5 links + `More` menu at ≥ lg**: the ADR-0018 §5 fallback. Adds a
  "More" hidden state; the active-inside-More problem is the same one that made tabs
  impractical. Rejected for now; remains available as a future enhancement.
