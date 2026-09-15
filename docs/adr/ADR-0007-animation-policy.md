# ADR-0007 — View Transitions API + CSS; `motion` only for reorder

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

Motion must aid comprehension (where did this come from / go), never decorate. Budgets
(ADR/STANDARDS §performance) rule out heavyweight animation libraries in shared code.

## Decision

- **Route and view-mode transitions**: View Transitions API (`document.startViewTransition`)
  with plain-CSS crossfade fallback; used for the DataView grid↔list switch and page
  navigation. Progressive enhancement only — zero JS cost where unsupported.
- **Micro-interactions** (toasts, sheets, dialogs, accordions): CSS
  transitions/keyframes using the motion tokens (150–250 ms, `--ease-out-soft`).
  Durations MUST come from tokens.
- **`motion` (Framer Motion successor)** may be added ONLY by modules that need layout
  animation/drag reorder (#18 parking lot, #20 to-do ordering) and only for those
  interactions, imported locally in the module.
- **`prefers-reduced-motion: reduce`** disables all non-essential motion globally (one
  media block in `globals.css`); view transitions are skipped.
- Forbidden: gratuitous entrance animations, parallax, animated skeleton shimmer beyond
  a subtle pulse, anything longer than 300 ms.

## Consequences

The foundation ships zero animation-library bytes. Motion is consistent because tokens
and the CSS live in one place.
