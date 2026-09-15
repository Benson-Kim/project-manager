# ADR-0004 — Tailwind 4 `@theme` design tokens; class-based dark mode

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

Tailwind CSS 4 is CSS-first: tokens are declared with `@theme` in `globals.css` and
become both utilities and CSS variables. The app needs light + dark themes, a manual
override (not only OS preference), and contrast-verified colours (WCAG 2.2 AA).

## Decision

- All tokens live in `src/app/globals.css` under `@theme`: semantic colour scale
  (`surface`, `surface-raised`, `ink`, `ink-muted`, `accent`, `danger`, `success`,
  `warning`, `line`…), radius, spacing additions, typography, motion durations/easings
  (`--duration-fast: 150ms`, `--duration-base: 200ms`, `--duration-slow: 250ms`,
  `--ease-out-soft`) and a fixed z-index scale (`nav: 30, sheet: 40, dialog: 50,
  toast: 60`). Components use ONLY semantic tokens — never raw palette values.
- Dark mode is **class-based**: `@custom-variant dark` on `html[data-theme="dark"]`;
  semantic variables are redefined for dark in one block. Theme choice: `system`
  (default) / `light` / `dark`, persisted in `localStorage`, applied before first paint
  by a small nonce-carrying inline script in the root layout (no flash), toggled via
  `ThemeProvider`.
- Every light/dark token pair is contrast-checked (≥ 4.5:1 body text, ≥ 3:1 large
  text/UI); the axe scan over the kitchen sink verifies rendered contrast in CI.

## Consequences

Modules never invent colours or durations; dark mode and future re-theming are single
file edits. `themeColor` metadata reflects the surface token.
