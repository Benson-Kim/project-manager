# ADR-0005 — Radix UI Dialog for overlays; native controls everywhere else

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

The mission mandates one overlay primitive (Radix UI or Base UI, decided once). This is
a mobile-first internal tool on modern evergreen browsers; native form controls give the
best mobile UX (OS pickers, correct keyboards) at zero bundle cost, while overlays
(dialog/sheet) and combobox need robust focus/ARIA behaviour.

## Decision

- **Overlays**: `@radix-ui/react-dialog` is the single overlay engine. Our `Dialog`
  (centred, desktop) and `Sheet` (bottom sheet on mobile, side panel on desktop) are
  styled wrappers around it. `ConfirmDialog` builds on `Dialog`. Radix over Base UI:
  API stable for years, focus trapping/`aria-modal`/scroll-lock proven, tree-shakes to
  the one component we import.
- **Native controls first**: `Select` wraps `<select>`, `DatePicker` wraps
  `<input type="date">`, `Checkbox`/`Radio` wrap the native inputs, `Switch` is a
  native checkbox with `role="switch"` styling. No JS re-implementations of what the
  platform does better on mobile.
- **Combobox** (type-ahead pickers, e.g. project search, participant pickers) is a thin
  in-house ARIA 1.2 combobox (`role="combobox"` input + `role="listbox"` popup),
  keyboard complete (↑ ↓ Enter Esc), verified by axe + Playwright on the kitchen sink.
- No other UI component libraries. Adding one requires a superseding ADR.

## Consequences

Exactly one new UI dependency (`@radix-ui/react-dialog`). Modules compose the shared
primitives in `src/components/ui/` and never import Radix directly.
