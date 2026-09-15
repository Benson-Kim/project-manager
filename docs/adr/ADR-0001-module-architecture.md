# ADR-0001 — Feature-sliced module architecture on Next.js App Router

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

23 modules will be built by independent agent sessions over months. Without a fixed
slice layout, each session invents its own structure and the codebase diverges.
Next.js 16 App Router favours Server Components and Server Actions; the product is a
small-team internal tool where simplicity and uniformity beat flexibility.

## Decision

- Every domain module lives in `src/modules/<module>/` with exactly these folders
  (omit a folder only if genuinely empty):
  `actions/` (Server Actions via the `action()` wrapper), `components/` (module UI),
  `schemas/` (zod input/row schemas), `repository/` (proc calls via `execProc` only),
  `queries/` (read helpers for Server Components).
- `src/app/(app)/<module>/` contains only thin route files (`page.tsx`, `loading.tsx`,
  `error.tsx`, route segments) that compose from `src/modules/<module>/`.
- Shared, module-agnostic code lives in `src/components/ui/` (primitives),
  `src/components/shell/` (app shell), `src/lib/` (db, action wrapper, auth, utils,
  messages). Modules import from shared; shared never imports from modules; modules
  never import from other modules' internals (only their exported schemas/queries when
  a real dependency exists, e.g. meetings → stakeholders picker).
- Server Components by default; `"use client"` only where interactivity requires it,
  as low in the tree as possible. All mutations are Server Actions; no ad-hoc route
  handlers for data (route handlers only for downloads/webhooks/auth callbacks).

## Consequences

Uniform navigation for humans and agents; a module session touches
`src/modules/<x>`, `src/app/(app)/<x>`, `db/…` and nothing else. Enforced by the
module Definition of Done and MR review.
