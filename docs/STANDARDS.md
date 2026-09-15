# Engineering Standards — Project Manager rebuild

**This document is the constitution.** Every module session (issues #3–#24) complies
with it; sessions may improve on it via ADR + MR, never silently deviate. Each rule
below is: decision → rationale → example. Decisions originate in `docs/adr/` (linked).
Companion documents: `LESSONS.md` (root — mandatory session operating rules; read it
FIRST, before anything else), `AGENTS.md` (operating manual),
`docs/MODULE-BLUEPRINT.md` (the per-module recipe), `docs/PLAN.md` (product plan),
`docs/SECURITY.md`.

Rule keywords: **MUST / MUST NOT** are enforced (lint, guardrail test, CI or review
gate); **SHOULD** requires a written justification in the MR to break.

---

## 1. Architecture ([ADR-0001](adr/ADR-0001-module-architecture.md))

### 1.1 Feature-sliced modules

Every domain module MUST live in `src/modules/<module>/`:

```
src/modules/suppliers/
  actions/        create-supplier.ts, update-supplier.ts, delete-supplier.ts
  components/     supplier-form.tsx, supplier-card.tsx, supplier-columns.tsx
  schemas/        supplier.ts   (zod input + row schemas, shared client/server)
  repository/     suppliers.ts  (execProc calls only)
  queries/        list-suppliers.ts, get-supplier.ts (Server Component reads)
```

`src/app/(app)/<module>/` holds thin routes only (`page.tsx`, `loading.tsx`,
`error.tsx`); all real code is in the module slice. Rationale: 23 modules built by
independent sessions stay navigable and uniform.

### 1.2 Rendering and mutations

- Server Components by default. `"use client"` MUST sit as low in the tree as
  possible and only where state/effects/events require it.
- All mutations MUST be Server Actions created with the `action()` wrapper (§3).
  Route Handlers are allowed only for file downloads, report exports, webhooks and
  Auth.js routes.
- Reads happen in Server Components via `queries/` → repository → proc. The client
  never fetches the app's own API for data.

### 1.3 Cache revalidation

- After a successful mutation the wrapper revalidates what the handler declares:
  `revalidatePath("/suppliers")` for list-shaped changes; tag targets expire via
  `expireTag` when a cross-module read is tagged (tag names = module keys) — the
  immediate read-your-writes call, not Next 16's stale-while-revalidate
  `revalidateTag(tag, profile)`.
- Dynamic pages that read session/headers stay dynamic; do not fight the router with
  manual `router.refresh()` — return the right revalidation from the action.

### 1.4 Forbidden list (MUST NOT — enforced)

| Forbidden | Enforcement |
|---|---|
| Inline SQL, `.query()`, `.batch()`, importing `mssql` outside `src/lib/db.ts` | ESLint + `no-inline-sql` + `db-gateway` guardrail tests |
| `any` (explicit or implicit), `@ts-ignore`/`@ts-expect-error` without an issue link | typecheck + `eslint-config-next/typescript` |
| Unhandled promises (`floating` awaits in actions/repositories) | review gate; wrap in the action pattern |
| `fetch()` to the app's own routes for data | review gate (grep in DoD) |
| Client-side secrets, `NEXT_PUBLIC_` secrets, secrets in the repo | Secret Detection + review |
| Helper text, tooltips, onboarding hints, placeholder-as-label | UX §5 + review gate |
| Ad-hoc toasts/dialogs/lists (bypassing shared primitives) | review gate |
| `confirm()`/`alert()`/`prompt()` | ESLint `no-alert` (foundation config) |
| New runtime dependency without an ADR | review gate + Renovate PR review |
| Weakening/removing a guardrail test or assertion to make CI pass | review gate; reverts the MR |

---

## 2. Data layer ([ADR-0002](adr/ADR-0002-stored-procedure-only-data-access.md), [ADR-0011](adr/ADR-0011-soft-delete-concurrency-audit-columns.md), [ADR-0012](adr/ADR-0012-proc-error-contract.md), [ADR-0016](adr/ADR-0016-list-proc-contract.md))

### 2.1 Objects and naming

- Tables: PascalCase singular (`app.Supplier`), PK `<Entity>Id INT IDENTITY`.
  Schemas: `app` (domain), `auth` (identity), `audit` (audit trail).
- Procs: `usp_<Entity>_<Verb>` — verbs `Create`, `GetById`, `List`, `Update`,
  `Delete`, plus business verbs (`Search`, `Snooze`, `Reorder`, `GanttData`…).
  One file per proc: `db/procs/<entity-kebab>/usp_<Entity>_<Verb>.sql`, always
  `CREATE OR ALTER`, header comment stating purpose, params and search columns.
- Migrations: `db/migrations/NNN_description.sql`, strictly increasing NNN, applied
  once and recorded in `app.SchemaMigrations` by `scripts/db-apply.sh`. A merged
  migration is immutable — fix forward with a new one.
- Seeds: `db/seed/NNN_entity.sql`, idempotent (`MERGE` or `IF NOT EXISTS`), data
  taken ONLY from `docs/source-analysis/access-database.md` §4.

### 2.2 Standard entity table shape

```sql
CREATE TABLE app.Supplier (
    SupplierId    INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Supplier PRIMARY KEY,
    ProjectId     INT NOT NULL CONSTRAINT FK_Supplier_Project REFERENCES app.Project(ProjectId),
    SupplierName  NVARCHAR(255) NOT NULL,
    -- … domain columns …
    IsDeleted     BIT NOT NULL CONSTRAINT DF_Supplier_IsDeleted DEFAULT 0,
    DeletedAtUtc  DATETIME2 NULL,
    DeletedBy     INT NULL,
    CreatedAtUtc  DATETIME2 NOT NULL CONSTRAINT DF_Supplier_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT NOT NULL,
    UpdatedAtUtc  DATETIME2 NULL,
    UpdatedBy     INT NULL,
    RowVer        ROWVERSION
);
CREATE INDEX IX_Supplier_ProjectId ON app.Supplier (ProjectId, IsDeleted) INCLUDE (SupplierName);
```

- **Soft delete** for user-created entities; hard delete only for child rows removed
  with their parent and via the Admin purge (module #23). Unique constraints on
  soft-deletable tables are filtered unique indexes (`WHERE IsDeleted = 0`).
- **Optimistic concurrency**: `RowVer ROWVERSION` on every entity; update/delete procs
  take `@RowVer BIGINT` and `THROW 50002, 'CONFLICT:…', 1` on mismatch. Get/List return
  `CAST(RowVer AS BIGINT) AS RowVer`.
- **Audit columns** as above on every entity table.

### 2.3 List proc contract (every list module)

Exact signature and behaviour per [ADR-0016](adr/ADR-0016-list-proc-contract.md):
`@ActorUserId, @ProjectId=NULL, @Search=NULL, @SortBy=NULL, @SortDir='asc', @Page=1,
@PageSize=25` (+ NULLable module filters); returns one result set with
`TotalCount = COUNT(*) OVER ()`; `OFFSET…FETCH`; `@SortBy` whitelisted via `CASE`
(never dynamic SQL); `IsDeleted = 0` always. Every whitelisted sort column is backed by
an index for the common path (usually `(ProjectId, IsDeleted) INCLUDE (…)`).

### 2.4 Mutations, transactions, audit

- Mutation procs take `@ActorUserId INT` (required), write the domain change AND the
  `audit.AuditLog` row (Action, EntityName, EntityId, BeforeJson/AfterJson via
  `FOR JSON PATH`) **in the same transaction** (`SET XACT_ABORT ON; BEGIN TRAN … COMMIT`).
- Multi-proc workflows use `withTransaction()` + `execProcTx` in the repository —
  never sequential auto-commit calls for related writes.
- Business failures use the THROW registry ([ADR-0012](adr/ADR-0012-proc-error-contract.md)):
  50001 `NOT_FOUND`, 50002 `CONFLICT`, 50003 `FORBIDDEN_ROW`, 50004 `VALIDATION`,
  50005 `DUPLICATE`. Example:
  `IF @@ROWCOUNT = 0 THROW 50001, N'NOT_FOUND:Supplier not found', 1;`

### 2.5 Typed result mapping

Repositories MUST zod-parse every recordset row (`rowSchema.parse(r)`) so DB drift
fails loudly at the boundary, and MUST expose plain typed functions —
no classes, no caching. Example: `src/modules/*/repository/`, pattern in
`src/lib/repositories/activity-status.ts`.

---

## 3. Server Action standard ([ADR-0003](adr/ADR-0003-typed-action-wrapper.md), [ADR-0015](adr/ADR-0015-auth-stub-contract.md))

Every mutation:

```ts
"use server";
export const createSupplier = action({
  name: "suppliers.create",
  schema: createSupplierInput,          // zod — the ONLY validation source
  permission: "suppliers:create",       // RBAC checked before the handler runs
  revalidate: ["/suppliers"],
  handler: async (input, ctx) =>
    suppliersRepo.create(input, ctx.session.userId), // proc audits the mutation
});
```

- Pipeline: parse → `requireSession()` → `can(role, permission)` → handler →
  map `AppError` → `ActionResult<T>`; revalidate on success. **Never throw to the
  client**; `redirect()` is the sanctioned exception.
- Row-level authorisation is ALSO enforced in the proc (`FORBIDDEN_ROW`) — the action
  layer is not the last line of defence.
- Role→permission matrix lives in `src/lib/auth/rbac.ts` only (source: PLAN.md §9).
  Until module #4 lands, sessions come from the dev-stub provider
  (`AUTH_DEV_BYPASS=1`); the contract in `src/lib/auth/types.ts` is final.

---

## 4. Security (bar: OWASP ASVS Level 2; see also docs/SECURITY.md)

- **Sessions**: Auth.js v5 credentials provider, JWT session strategy (encrypted,
  `AUTH_SECRET` ≥ 32 random bytes), 8 h idle expiry, session version stamp for
  server-side revocation (module #4). Passwords: **argon2id** (m=19456 KiB, t=2, p=1
  — OWASP baseline), min length 12, no composition rules, deny top-10k list.
- **Rate limiting** (module #4): login 5/min/IP + username lockout with backoff;
  mutations 60/min/session — fixed-window counters in SQL (single-instance app; no
  Redis needed).
- **CSRF**: Server Actions are protected by Next.js origin checks (POST +
  Origin/Host validation); custom Route Handlers that mutate MUST verify
  `Origin`/`Sec-Fetch-Site` themselves. `form-action 'self'` in CSP backs this up.
- **Headers**: per-request nonce CSP in `src/proxy.ts` (`strict-dynamic`, no
  `unsafe-inline` scripts) + HSTS (prod), `X-Content-Type-Options`, `frame-ancestors
  'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, minimal
  `Permissions-Policy` (next.config.ts). The e2e suite asserts the full header set
  (`e2e/security-headers.spec.ts`).
- **Validation**: zod at EVERY boundary — action inputs, env (`src/lib/env.ts`), URL
  list params (`src/lib/list-params.ts`), repository row parsing, webhook payloads.
- **Audit**: every mutation → `audit.AuditLog` (who, action, entity, id,
  before/after JSON, IP where available, UTC timestamp). Login/logout/failed-login
  audited from #4. Audit rows are append-only (no update/delete procs on `audit`).
- **Uploads** (module #22): sniff magic bytes (never trust extension/MIME), allowlist
  types, 25 MB cap, store outside web root under content-hash names, serve via
  authenticated handler with `Content-Disposition: attachment` + `nosniff`, AV-scan
  hook stub, quota per project.
- **Secrets**: GitLab CI/CD variables only; `.env.example` documents shape. No secret
  ever in code, logs or client bundles.
- **Logging**: structured server logs without PII/credentials/tokens; log error codes
  and entity ids, not payloads.
- **Scanning**: SAST, Secret Detection, Dependency Scanning on develop/main;
  Renovate + scheduled `npm audit fix` MRs; container scanning added with the deploy
  target (module #24).

---

## 5. UX/UI standard — clean UI, no hints ([ADR-0004](adr/ADR-0004-design-tokens-and-theming.md), [ADR-0010](adr/ADR-0010-detail-edit-pattern.md))

### 5.1 The no-hints rule

No helper text, no explanatory tooltips, no onboarding tours, no placeholder
instructions — anywhere. Clarity comes from: visible labels, sensible defaults,
logical grouping, empty states that state the one next action, and immediate
validation feedback. If a screen needs explanation, redesign the screen.

### 5.2 Design tokens

All visual values come from `@theme` tokens in `src/app/globals.css`: semantic colours
(light + dark, contrast-verified), spacing, radius, typography scale, motion
durations/easings, z-index scale. Components MUST use semantic tokens
(`bg-surface`, `text-ink-muted`, `border-line`, `bg-accent`…) — never raw palette
values or arbitrary hex. Dark mode is `html[data-theme="dark"]`, chosen
system/light/dark via `ThemeProvider`, applied pre-paint (no flash).

### 5.3 Layout rules

- Design at 360 px first; enhance upward (`sm/md/lg`). Test at 360/768/1280.
- Touch targets ≥ 44 × 44 px (`min-h-11` on interactive rows/buttons).
- Safe-area insets respected (`pb-[env(safe-area-inset-bottom)]` on bottom nav/sticky
  bars); PWA display standalone.
- ONE navigation pattern: bottom tab bar (≤ md: Projects, To-Do, +context, Menu) and
  desktop sidebar (≥ md) — both rendered by `src/components/shell/`.
- ONE page anatomy: `PageHeader` (title + primary action) → `Toolbar`
  (search/filter/sort/view toggle) → content → sticky primary action on mobile where
  the header scrolled away.

### 5.4 Forms ([ADR-0009](adr/ADR-0009-forms.md))

Always-visible labels; validate on blur + submit (same zod schema as the server);
inline errors under fields (`aria-invalid` + `aria-describedby`); pending state with
in-button spinner + double-submit guard; error summary focused on server failure;
success toast + announcer; unsaved-changes guard on dirty forms; optimistic updates
only for harmless toggles/reorder.

### 5.5 Detail/edit ([ADR-0010](adr/ADR-0010-detail-edit-pattern.md))

Record open = `Sheet` (bottom sheet < md, right panel ≥ md), URL-synced (`?id=`),
focus returned on close. Full routes only for the decided exceptions (project charter,
meeting workspace, notes editor, financial workflow, Gantt, reports).

### 5.6 Destructive confirmation

One `ConfirmDialog`: names the object ("Delete supplier Acme?"), body states the
consequence in one sentence, danger button = the verb, Cancel focused by default.
Bulk deletes state the count. Soft-deleted data means no "cannot be undone" theatre —
say what happens.

---

## 6. Lists — the DataView standard ([ADR-0006](adr/ADR-0006-dataview.md))

Every list module MUST render through the shared `DataView`:

- Grid (cards) + list (table/rows) arrangements; toggle persisted per user per module
  (`usp_ViewPreference_Get/Set`, cookie fallback); cards are the mobile default.
- URL-synced state `?q=&sort=&dir=&view=&page=` + module filters, parsed by the shared
  `listParamsSchema`; server-side paging via the list proc contract (§2.3). Filter
  state survives refresh, back and deep links.
- Sticky toolbar; roving-tabindex keyboard navigation (↑↓ move, Enter opens,
  Space selects, Esc clears selection); row selection + bulk-action bar; skeletons via
  `loading.tsx`; `EmptyState` / zero-result (with "clear filters") / `ErrorState`.
- Table columns declare `priority` 1–3; mobile shows priority 1, ≥ sm adds 2,
  ≥ lg adds 3. Cards show the fields listed in the module's issue.
- Result counts announced via LiveAnnouncer; grid↔list switch animated with the View
  Transitions API ([ADR-0007](adr/ADR-0007-animation-policy.md)), CSS fallback,
  disabled under `prefers-reduced-motion`.

Modules MUST NOT fork DataView. Missing capability → extend the shared component in
its own MR first.

---

## 7. Feedback & announcements ([ADR-0008](adr/ADR-0008-feedback-and-messages.md))

One `Toaster` (success 4 s / info 4 s / warning 6 s / error sticky; optional Undo; max
3 visible). One `LiveAnnouncer` for route changes, result counts, save confirmations.
Route-transition top progress bar; inline button spinners for actions. PWA
offline/online banner. Error boundaries (`error.tsx`) per route segment with a retry
button; `not-found.tsx` and global error page from the foundation templates. ALL copy
in `src/lib/messages.ts` — short, sentence case, no exclamation marks, no jargon
(guardrail test enforces tone rules).

---

## 8. Accessibility — WCAG 2.2 AA

- Semantic landmarks (`header/nav/main`), one `h1` per page, labels always visible.
- Visible focus (`:focus-visible` ring token) on every interactive element; focus
  trapped in dialogs/sheets (Radix) and returned to the trigger on close.
- Token pairs contrast-verified (≥ 4.5:1 text, ≥ 3:1 UI); axe scan in Playwright per
  module + kitchen sink MUST report zero serious/critical violations.
- Keyboard-complete: every mouse path has a keyboard path (DataView nav, combobox,
  sheet, toasts dismissible).
- `aria-live` used only via the shared Toaster/Announcer (no competing live regions).

---

## 9. Performance budgets

- LCP < 2.5 s on a mid-range phone (4× CPU throttle, Fast 3G) for list pages; INP
  < 200 ms.
- Per-route first-load JS ≤ 170 kB gzip (Next build output is the meter; the build
  fails review if a module exceeds it without justification).
- Streaming: `loading.tsx` per route segment; Suspense around slow queries so shells
  paint immediately.
- Images via `next/image` only; icons are inline SVG (no icon-font/library); fonts:
  system font stack (zero font bytes) — changing this needs an ADR.
- Caching: Server Component fetch-less reads hit SQL per request (fine for internal
  scale); expensive aggregates (reports, Gantt) may cache with tags + revalidate on
  mutation. No client-side data caches (no SWR/React Query — forbidden list).

---

## 10. Testing ([ADR-0013](adr/ADR-0013-testing-standard.md))

Vitest (node) for schemas/actions/repositories (mock `execProc`), guardrail tests
(no-inline-sql, db-gateway, messages tone); Playwright per module: happy path, one
validation failure, one RBAC denial (post-#4), axe scan; coverage ≥ 80 % lines on
`src/modules/**` + `src/lib/**`; e2e data namespaced `e2e-`; seeds are fixtures.
Never weaken a test to pass CI.

---

## 11. Conventions

- **Files**: kebab-case (`supplier-form.tsx`); components PascalCase; hooks
  `use-*.ts`; procs `usp_*`; tables PascalCase singular.
- **Commits**: Conventional Commits (`feat(suppliers): …`, `fix:`, `docs:`, `ci:`,
  `chore:`). Body explains *why*. `[e2e]` / `[lockfile]` flags opt in to those CI
  jobs on feature branches.
- **Branches**: `feature/<module-key>` from `develop`; maintenance `duo/<type>/<desc>`;
  MR → `develop`; release MR `develop` → `main`.
- **MRs**: use `.gitlab/merge_request_templates/Module.md`; title
  `Draft: feat(<module>): <summary>`; `Closes #<iid>`; green pipeline required
  (lint, typecheck, test, build, e2e for module MRs — commit with `[e2e]`).
- **Docs**: every structural decision is an ADR in `docs/adr/` before implementation.
  Prose (`*.md`, `docs/`) is exempt from Prettier; code is not.
- **Dependencies** ([ADR-0014](adr/ADR-0014-dependency-policy-and-pins.md)): latest
  stable, minimal set, every runtime addition has an ADR; `package-lock.json` is
  committed; `npm ci` always. The workspace proxy blocks npmjs.org — versions are
  verified via the `lockfile:generate` CI job's report, not locally.

---

## 12. Module Definition of Done

Copy-paste checklist — also embedded in each module issue:

```
- [ ] ADR added/updated for any new structural decision
- [ ] Migration(s) NNN_*.sql: tables per source analysis + audit cols + RowVer + soft delete
- [ ] Procs: usp_<Entity>_{Create,GetById,List,Update,Delete} (+ business verbs),
      CREATE OR ALTER, audit rows in-transaction, THROW error contract,
      List proc follows ADR-0016 exactly
- [ ] Seeds from docs/source-analysis/access-database.md §4, idempotent
- [ ] Repository: execProc only, zod row parsing, typed inputs
- [ ] Schemas: zod input schemas shared client/server
- [ ] Actions: action() wrapper with permission + revalidate; no raw server actions
- [ ] List page: DataView (grid + list), URL state, server paging, empty/zero/error
      states, view preference persisted; card fields + column priorities per issue
- [ ] Detail/edit per issue pattern (Sheet or decided full route); ConfirmDialog for
      destructive ops; unsaved-changes guard
- [ ] Copy added to src/lib/messages.ts only; no hints/tooltips/helper text
- [ ] A11y: labels, focus management, axe scan clean (serious/critical = 0)
- [ ] Tests: Vitest (schemas, repository w/ mocked db, action success+failure),
      Playwright (happy path, validation failure, RBAC denial, axe), coverage ≥ 80 %
- [ ] npm run lint && typecheck && test && build green in CI; e2e green ([e2e] commit)
- [ ] No new dependency without ADR; lockfile updated via [lockfile] job if needed
- [ ] MR from feature/<module> → develop, template filled, Closes #<iid>, pipeline green
- [ ] Issue acceptance criteria all checked; TRACEABILITY.md row updated
```
