# ADR-0009 — Forms: shared zod schema, `useActionState`, blur validation, no form library

Status: Accepted · Date: 2026-09-15 · Session: foundation (#2)

## Context

React 19 + Server Actions provide form state natively (`useActionState`,
`useFormStatus`). The same zod schema must validate on the client (immediate feedback)
and in the action wrapper (authoritative). A form library (react-hook-form etc.) adds a
dependency and a second source of truth for validation.

## Decision

- Each form's zod input schema lives in `src/modules/<module>/schemas/` and is imported
  by BOTH the Server Action (via `action()`) and the client form.
- The shared `useZodForm(schema)` hook (`src/components/ui/form/`) provides per-field
  blur validation and merges server `fieldErrors` from the `ActionResult`; submission
  goes through `useActionState(serverAction)`.
- One form pattern everywhere: always-visible `<label>` (never placeholder-as-label),
  inline error under the field (`aria-describedby` + `aria-invalid`), validate on blur
  and on submit; pending state disables the submit button (double-submit guard) and
  shows an inline spinner; on server failure an error summary appears above the form
  and focus moves to it; on success a toast confirms and the announcer speaks.
- Optimistic updates (`useOptimistic`) only where loss is harmless and reconciliation
  trivial (toggles, reorder) — never for create/delete of records.
- No hidden client-only validation rules: if it isn't in the zod schema, it doesn't
  exist.

## Consequences

Zero form-library dependency; one validation source of truth; every module form looks
and behaves identically. The kitchen sink exercises the full pattern for e2e + axe.
