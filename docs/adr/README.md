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
| [0048](ADR-0048-sub-requirements.md) | Sub-requirements: the register becomes a tree — one nullable self-reference, a reference derived by one recursive walk (`FR-1.1.1`), numbering unique per parent, up to 50 levels, and parentage set at create (a delete may move its children up to its own parent) so cycles are unreachable | Accepted; amended 2026-11-04 with the client's answers: deleting a parent is refused unless its children move up a level, retyping a parent stays refused (extends 0037, 0016, 0046; closes the one correction 0047 left open) |
| [0049](ADR-0049-desktop-spelling-and-grammar-menu.md) | The desktop right-click menu: spelling fixes and a dictionary, offline grammar (Harper, in its own process, stopped when idle) for the paragraph at the caret, editing, and a per-user switch | Accepted |
| [0050](ADR-0050-risks-and-issues.md) | The risks & issues register: the module #3 procedures gain the access, list and dropdown contracts they predate, five managed lists with four locked labels, rich-text description and mitigation plan, and no computed severity | Accepted |
| [0051](ADR-0051-financial-currency.md) | A financial sheet's currency, or no currency symbol at all: the list from the runtime's ICU data, the suggestion from the user's time zone, symbols on screen and in the PDF, the code in CSV headers and a Currency column in the project export | Accepted (amends 0029, extends 0030). 0050 is risks and issues' (`feature/risks-issues`) |
| [0052](ADR-0052-gantt-wbs-and-kanban-rebuild.md) | The Gantt, work breakdown and Kanban rebuild: MoSCoW, criteria, estimate and owner per requirement, a budget and note per deliverable, the plan's sticky note, progress derived from met ticks, deliverable cards on boards, and the Gantt as lanes of cards | Accepted (amends 0027, 0036, 0038, 0046) |
| [0053](ADR-0053-notebook-tabs-and-printing.md) | Notebook tabs (each holds at least one page; removing them keeps every page), printed notebooks on A4 portrait, and an editor toolbar that stays in view | Accepted |
| [0054](ADR-0054-validated-as-a-managed-list.md) | The assumptions & constraints register's Validated column becomes a managed list (Yes and No locked, no value shown as None), with the inherited IsValidated bit kept as a derived copy rather than dropped | Accepted (amends 0022) |
| [0055](ADR-0055-decision-log.md) | The decision log: a per-project register cited by a number that is never reused, with impacted areas and consulted people as replaceable sets and a supersession link that refuses cycles | Accepted |
| [0056](ADR-0056-per-user-settings.md) | Per-user settings in app.UserPreference, starting with the "Due soon" window each user picks in Settings; the to-do list, cards and Upcoming alerts all use it | Accepted |
| [0057](ADR-0057-idle-sign-out.md) | Idle sign-out per user (Settings > Sign-in, 15 min to 8 h or Never): the jwt callback and the proxy sign out an idle user, the browser sends a heartbeat on real input at most once a minute; sessions are capped at 30 days | Accepted |
| [0058](ADR-0058-admins-manage-users.md) | Admins manage users in Settings > Users: the `admin:users` action gate and a 404 page for a User, proc checks on every user proc, a locked guard that keeps the actor's own access and an active Admin, sessions revoked on role change, deactivation and reset, and strict inputs; amended: Settings > Audit log, Admin only in the page and the procs, append-only, values shown as text; Settings > Backup status, desktop only, read from a per-PC file rather than a table, the 7-day copy rule shared with the tray reminder, a missing file unknown rather than overdue | Accepted |
| [0059](ADR-0059-recurring-to-dos-and-calendar.md) | Recurring to-dos and a to-do calendar: a 1:1 rule (hourly, daily, weekly on chosen days, monthly by day, Nth weekday or last day; ending on a date, after a count or never), occurrences expanded at read time for a window of at most 62 days and capped at 1,000 per series, a row only for an occurrence someone changed, "this one or the whole series", and a month-grid Calendar view | Accepted (defaults marked in the ADR) |
| [0060](ADR-0060-configurable-requirement-links.md) | Requirement links become configurable: a link means "traces to", an Admin sets which types may link in Settings, links carry an author, date, rationale and status, loops are refused, coverage comes from each test's latest run through inherited leaves, and deleting a parent asks whether to delete or orphan its children. Amends ADR-0037 and ADR-0048. |
| [0061](ADR-0061-requirement-canvases.md) | Requirement canvases: many per project, a view over the register, saved hand positions, reveal by drag, link by handle, `@xyflow/react` with our own layout. |
| [0062](ADR-0062-responsibility-matrices.md) | Responsibility matrices: nine frameworks (RACI, DACI, RAPID, DARE, RASCI, RACI-VS, ARPA, MOCHA, RATSI) in a registry, many matrices per project over WBS items or decisions, up to 40 members, one-per-row roles kept in step with the WBS assignee, server-side checks in the procs. |
| [0063](ADR-0063-page-undo-history.md) | Undo and redo on every page: a 30-step history per page and project in the browser, steps taken back through the module's own actions with the row version, dropped on another user's change; deletes stay final. |
| [0064](ADR-0064-bpmn-diagrams.md) | BPMN diagrams: several per project, BPMN 2.0 symbols, labelled sequence, message, default and association connectors, pools with as many lanes as wanted, one JSON document per diagram saved whole under the row version, `@xyflow/react` instead of bpmn-js, print, PNG and BPMN XML export. |
| [0066](ADR-0066-checklists-and-column-kinds.md) | Dynamic checklists: several per project, a title and done tick per row plus columns people add (date, text, web link, sign-off or to-do button); one registry of column kinds shared by every owner; typed cell slots, the row version on every cell write, Contributors add and Managers delete. |
| [0067](ADR-0067-custom-register-columns.md) | The requirement register's own column names and added columns, per project: a rename writes only a label keyed by the column's stable key; up to five added columns (date, text, web link, choice list) whose values are keyed by id; names unique ignoring case; soft delete keeps values; kind change only while empty; choices renamed by id and kept while in use. |
| [0065](ADR-0065-project-menu-six-groups.md) | Project menu in the client's six groups (Strategy & Financials, Requirements & Deliverables, Execution, Governance, Workspace, Communication), their page names, unbuilt pages left out, the canvas and stakeholder matrix as their own entries. Amends 0019 and 0046 decision 1. |
