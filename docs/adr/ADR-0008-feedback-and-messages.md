# ADR-0008 — One toast system, one live announcer, centralised messages

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

Clean UI with no hints means feedback must be immediate, consistent and accessible;
copy written per-module drifts in tone.

## Decision

- **Toasts**: one in-house `Toaster` (`src/components/ui/toast.tsx`, context +
  `useToast`). Variants success/info/warning/error. Success/info auto-dismiss after
  4 s, warning 6 s; error is sticky until dismissed. Optional single action (e.g.
  Undo). Max 3 visible, queue beyond. Rendered in a `aria-live="polite"` region
  (errors `assertive`). No other toast/notification mechanism is permitted.
- **LiveAnnouncer**: one visually-hidden `aria-live` region (`useAnnouncer`) announces
  route changes (page title), list result counts, and save confirmations for screen
  readers.
- **Progress**: top navigation progress bar for route transitions; inline spinner in
  the submitting button for actions (`useFormStatus`); skeletons only in `loading.tsx`.
- **PWA connectivity**: one offline/online banner driven by `navigator.onLine` +
  `online`/`offline` events.
- **Unsaved changes**: forms with dirty state register a guard (`beforeunload` +
  in-app navigation confirm via `ConfirmDialog`).
- **Copy**: ALL user-facing strings live in `src/lib/messages.ts`, grouped by module.
  Tone: short, sentence case, plain words, no exclamation marks, no jargon, no
  helper/hint text. Buttons are verbs ("Save", "Delete"); destructive confirmations
  name the object ("Delete supplier Acme?").

## Consequences

Feedback is uniform and testable (kitchen-sink e2e asserts toast + announcer
behaviour). New copy = a `messages.ts` diff, reviewable for tone in one place.
