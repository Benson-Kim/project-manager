# Architecture Decision Records

Every structural decision in this project is recorded here before it is implemented.
Later sessions MUST NOT deviate from an accepted ADR; to change a decision, add a new
ADR that supersedes the old one and get it merged first.

Format: context → decision → consequences. Keep them short; `docs/STANDARDS.md` holds
the full rules and examples derived from these decisions.

| ADR | Title | Status |
|---|---|---|
| [0001](ADR-0001-module-architecture.md) | Feature-sliced module architecture on Next.js App Router | Accepted |
| [0002](ADR-0002-stored-procedure-only-data-access.md) | Stored-procedure-only data access | Accepted |
| [0003](ADR-0003-typed-action-wrapper.md) | Typed Server Action wrapper (validate → auth → RBAC → execute → audit) | Accepted |
| [0004](ADR-0004-design-tokens-and-theming.md) | Tailwind 4 `@theme` design tokens; class-based dark mode | Accepted |
| [0005](ADR-0005-ui-primitives.md) | Radix UI Dialog for overlays; native controls elsewhere | Accepted |
| [0006](ADR-0006-dataview.md) | One shared DataView (grid/list) for every list module | Accepted |
| [0007](ADR-0007-animation-policy.md) | View Transitions API + CSS; `motion` only for reorder | Accepted |
| [0008](ADR-0008-feedback-and-messages.md) | One toast system, one live announcer, centralised messages | Accepted |
| [0009](ADR-0009-forms.md) | Forms: shared zod schema, `useActionState`, blur validation, no form library | Accepted |
| [0010](ADR-0010-detail-edit-pattern.md) | Detail/edit: bottom sheet on mobile, side panel on desktop | Accepted |
| [0011](ADR-0011-soft-delete-concurrency-audit-columns.md) | Soft delete, rowversion concurrency, audit columns | Accepted |
| [0012](ADR-0012-proc-error-contract.md) | Stored-procedure error-code contract (`THROW 50xxx, 'CODE:message'`) | Accepted |
| [0013](ADR-0013-testing-standard.md) | Testing standard: Vitest + Playwright + axe, guardrail tests | Accepted |
| [0014](ADR-0014-dependency-policy-and-pins.md) | Dependency policy and the eslint/typescript pins | Accepted |
| [0015](ADR-0015-auth-stub-contract.md) | Auth provider interface stubbed until module #4; contract final now | Accepted |
| [0016](ADR-0016-list-proc-contract.md) | List stored-procedure contract (paging, sorting, search, TotalCount) | Accepted |
| [0017](ADR-0017-auth-sessions-and-login-protection.md) | Auth sessions and login-attempt protection | Accepted |
| [0018](ADR-0018-project-workspace-navigation.md) | Project workspace navigation: nested layout + scrollable section links | Superseded by ADR-0019 §2 |
| [0019](ADR-0019-project-section-nav-grouped-disclosure.md) | Project section nav: grouped disclosure buttons supersede flat link row | Accepted |
| [0020](ADR-0020-web-push-todo-alert-delivery.md) | Event-driven Web Push todo-alert delivery | Accepted |
