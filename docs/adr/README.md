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
| [0017](ADR-0017-auth-sessions-and-login-protection.md) | Auth sessions, JWT strategy, login-rate limiting, password policy | Accepted |
| [0018](ADR-0018-project-workspace-navigation.md) | Project workspace navigation: nested layout + scrollable section links | Superseded by ADR-0019 §2 |
| [0019](ADR-0019-project-section-nav-grouped-disclosure.md) | Project section nav: grouped disclosure buttons supersede flat scrollable row | Accepted |
| [0020](ADR-0020-web-push-todo-alert-delivery.md) | Event-driven Web Push todo-alert delivery | Accepted |
| [0021](ADR-0021-per-project-access-levels.md) | Per-project access levels; global roles collapse to Admin and User | Accepted |
| [0022](ADR-0022-managed-lookup-lists.md) | Managed dropdown lists (Admin-edited, rename cascade, option colours) | Accepted |
| [0023](ADR-0023-dataview-datasheet-mode.md) | DataView datasheet mode: in-cell editing, new-entry row, per-user layout, cross-project Project column | Accepted (amends 0006, 0016) |
| [0024](ADR-0024-per-person-permission-overrides.md) | Per-person permission overrides (team cog) and editable team titles | Accepted (amends 0021, 0022) |
| [0025](ADR-0025-rich-text-editor-and-sanitiser.md) | Rich-text editing (Tiptap v3) and server-side HTML sanitisation (sanitize-html) | Accepted |
| [0026](ADR-0026-file-storage.md) | File storage: owner-scoped attachments, streamed uploads, quota, desktop uploads folder | Accepted (amends 0003, 0012) |
| [0027](ADR-0027-wbs-gantt.md) | Key deliverables as a work breakdown that draws an editable Gantt | Accepted |
| [0028](ADR-0028-meetings-data-model.md) | Meetings data model: minutes tree, participants, meeting-row lock, reorder and set contracts | Accepted |
| [0029](ADR-0029-financials-calculator.md) | Financials calculator: master templates and project snapshots | Accepted |
| [0030](ADR-0030-financial-documents-and-outputs.md) | Financial document checklist (template-managed, advisory suggestions), print view, PDF and CSV outputs | Accepted (on top of 0029) |
| [0031](ADR-0031-request-gate-internal-routes-and-throttling.md) | The request gate: bearer-authenticated internal routes outside the session gate; in-process throttling; login limiting keyed on the user | Accepted (amends 0017) |
| [0032](ADR-0032-deployment-topology-and-backups.md) | Deployment topology (single-user desktop or one server stack) and host-run backups with an operator upload hook | Accepted (supersedes PLAN §5) |
| [0033](ADR-0033-least-privilege-app-login.md) | The server edition's app connects as an EXECUTE-only login (`pm_web`, role `app_executor`); the operator's scripts use their own admin credentials | Accepted (amends 0032) |
| [0034](ADR-0034-desktop-update-signing.md) | Desktop releases signed with a self-issued publisher certificate; installed apps verify every update against it, trusted once by provisioning | Accepted (0033 is the server app login, other session) |
| [0035](ADR-0035-notes-model.md) | Notes are notebooks of titled rich-text pages (`NoteTab`), with page search text and a reorder that checks every RowVer | Accepted |
| [0036](ADR-0036-wbs-requirements-status-menu.md) | Requirements under each WBS item, item colour from its status, and a context menu that shows the whole name | Accepted (amends 0027) |
| [0037](ADR-0037-requirement-types-and-traceability.md) | Requirement types (need/solution), a project-level register with per-project references, traces to needs and allocation to any number of deliverables | Accepted (amends 0036, 0027; 0003 for the failure reference) |
| [0038](ADR-0038-boards.md) | Kanban/scrum boards: the board is its own access scope (project-backed or standalone); lock the board row then assert access; tolerant override parsing | Accepted (amends 0024, extends 0021; 0035 is on another branch) |
| [0040](ADR-0040-row-access-answers-alike.md) | A project the actor cannot see answers NOT_FOUND, not FORBIDDEN_ROW | **Proposed** (amends 0012, 0021; closes ADR-0037 finding 2). 0038 is boards' (`feature/boards`), 0039 is reserved for WBS/Gantt colour mode |
| [0041](ADR-0041-rich-text-formats.md) | Rich-text colours stored by name (theme-safe), highlights, cell shading, indents, numbering styles, h2-h6 and page breaks | Accepted (amends 0025) |
| [0042](ADR-0042-toolbar-hover-hints.md) | Hover hints on the rich-text toolbar only: each control's name and shortcut, from its aria-label and aria-keyshortcuts (WCAG 1.4.13) | Accepted (amends STANDARDS §5.1, 0025) |
| [0043](ADR-0043-meeting-action-follow-ups.md) | An action item's status (on hold / in progress / completed), its one-to-many follow-ups, and carrying an unfinished action into the project's later meetings | Accepted (amends 0028 §4) |
| [0044](ADR-0044-on-hold-reason-and-list-sorting.md) | Why an action is on hold (only a hold carries a reason), column-header sorting bound to each proc's ORDER BY, and a wide table's sticky scrollbar | Accepted (extends 0043, 0016, 0023) |
| [0045](ADR-0045-read-committed-snapshot.md) | Versioned reads: READ_COMMITTED_SNAPSHOT on, so a read takes no shared locks and can no longer deadlock with a write | Accepted (amends 0035's race checks) |
| [0046](ADR-0046-milestones-dependencies-and-the-requirements-group.md) | Requirements as its own nav group (a group of one is a link), a deliverable's 0-to-many assignees reachable from the WBS editor, milestones as one-day leaves in the breakdown, and — proposed — typed task dependencies | Accepted for decisions 1–4, **Proposed** for 5 (amends 0018 §3, 0019, 0027 §2; amends 0027 §9 when 5 lands) |
| [0047](ADR-0047-the-1-0-12-client-corrections.md) | The corrections the client marked on the 1.0.12 test sheet: Executive summary uncapped, an action or a to-do assigned to someone who is not a stakeholder, legal numbering, two retired fields whose columns stay, a reported layout-save failure, and the requirement register's CSV and PDF exports | Accepted (extends 0037, 0043, 0044, 0023, 0041). Sub-requirements are **not** decided here — ADR-0048 and migration 048 are reserved for them |
| [0048](ADR-0048-sub-requirements.md) | Sub-requirements: the register becomes a tree — one nullable self-reference, a reference derived by one recursive walk (`FR-1.1.1`), numbering unique per parent, four levels, and parentage set once so cycles are unreachable | Accepted for 1–7; **Provisional** for 8 and 9 (what deleting a parent and retyping a parent do), which are the client's to settle and are refusals meanwhile (extends 0037, 0016, 0046; closes the one correction 0047 left open) |
| [0049](ADR-0049-desktop-spelling-and-grammar-menu.md) | The desktop right-click menu: spelling fixes and a dictionary, offline grammar (Harper, in its own process, stopped when idle) for the paragraph at the caret, editing, and a per-user switch | Accepted |
| [0050](ADR-0050-risks-and-issues.md) | The risks & issues register: the module #3 procedures gain the access, list and dropdown contracts they predate, five managed lists with four locked labels, rich-text description and mitigation plan, and no computed severity | Accepted |
