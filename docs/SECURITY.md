# Security Design & Management

Authoritative security reference for the Project Manager rebuild.
Roles/permissions matrix: [`PLAN.md`](PLAN.md) §9. Runtime pieces land with
modules 3 (auth) and 22 (admin); the platform pieces below are live from the
foundation module.

## Authentication & sessions (implemented in module #4 — ADR-0017)

- **Auth.js v5** (`next-auth@5.0.0-beta.32` — v5 has no stable release; the
  beta line is what Auth.js documents for v5, recorded in ADR-0014) credentials
  provider. `authorize()` is the single gatekeeper: IP rate limit → user lookup
  → lockout check → argon2id verify → audit. Every failure path returns the
  SAME generic message; username existence is never revealed
  (`usp_User_GetByUsername` returns an empty set for unknown users, no THROW).
- Password hashing: **argon2id** (`argon2@0.44`, m=19456 KiB, t=2, p=1 —
  STANDARDS §4); stored in `auth.User.PasswordHash`, returned ONLY by
  `usp_User_GetByUsername`, never logged or audited.
- Password policy: min 12 / max 128, no composition rules, denylist
  (`src/lib/auth/password-denylist.ts`; only 12+-character entries can ever
  match under the length rule, so the set holds exactly the 12+-character
  subset). The denylist is the verified SecLists top-10k extraction (issue
  #27): source
  `Passwords/Common-Credentials/xato-net-10-million-passwords-10000.txt`
  (the renamed successor of `10-million-password-list-top-10000.txt`),
  sha256 `c63d5e4ccc31344d662583cc39ca4bd5bd20517ff1d24501f0c4e0c22d9b722a`,
  fetched 2026-09-16 by the `denylist:generate` CI job (opt-in via a
  `[denylist]` commit flag) — 24 SecLists entries + 24 project starter
  additions, committed in `src/lib/auth/password-denylist.data.ts`. The
  subset is tiny (<1 KB), so it ships in the shared client/server policy
  module — no server-only split needed.
  **Attribution:** the denylist data derives from
  [SecLists](https://github.com/danielmiessler/SecLists) by Daniel Miessler
  and Jason Haddix, MIT licence
  (<https://github.com/danielmiessler/SecLists/blob/master/LICENSE>).
- **JWT sessions** (encrypted, `AUTH_SECRET` ≥ 32 random bytes env-only, 8 h
  maxAge, `SameSite=Lax`/`HttpOnly`/`Secure` Auth.js defaults) with a
  **SessionVersion revocation stamp**: `src/lib/auth/provider.ts` re-checks the
  DB value on every request, so password change / role change / deactivation /
  `usp_User_BumpSessionVersion` revoke all outstanding sessions immediately.
  No DB session table (ADR-0017 records the trade-off).
- Login rate limiting: 5/min/IP fixed-window counters in SQL
  (`auth.LoginAttempt`, `usp_LoginAttempt_Record`, atomic + self-purging) plus
  per-user lockout with exponential backoff (30 s·2^n from the 5th consecutive
  failure, capped at 30 min, `usp_User_RecordLoginAttempt`).
- All auth events audit-logged in-proc: Login, LoginFailed (incl. unknown
  usernames, without an EntityId), Logout, SetPassword (never the hash).
- Seeded admin has `MustChangePassword = 1`; the proxy forces
  `/change-password` (the flag travels in the JWT — edge-safe) until a
  policy-compliant password is set, which also rotates SessionVersion.

## Authorization (RBAC)

- Two layers (ADR-0021; the single policy is `src/lib/auth/rbac.ts`, source
  PLAN.md §9):
  - **Global role** Admin / User (`auth.Role`, 1:1 on the user).
  - **Per-project access level** Viewer / Contributor / Manager on the user's
    team row (`app.ProjectAssignee.AccessLevel`). Admins hold Manager
    everywhere; a User only reaches projects they are on.
- Enforced in three layers:
  1. Route guard — `src/proxy.ts` + protected layouts redirect
     unauthenticated/unauthorised users.
  2. Server-action guard — every action asserts the required permission before
     calling a repository.
  3. Stored-proc guard — every project-scoped proc takes `@ActorUserId` (never
     a role) and calls `dbo.usp_Project_AssertAccess @MinLevel` (FORBIDDEN_ROW
     50003), then mutations write `audit.AuditLog`. Pages render missing and
     inaccessible records alike as not found.
- Per-person overrides (ADR-0024, `app.ProjectPermissionOverride`): a project Manager
  can grant or revoke create/update/delete per section for one member. The procs
  decide (`usp_Permission_Require`; every write check names its `@Permission`). An
  override applies only to members of the project, never to the charter or team, and
  nobody can set their own. Every change is audited.
- Managed dropdown lists (ADR-0022): only Admins edit list values
  (`admin:lookup-lists`, `usp_LookupList_Set`); every Create/Update proc re-checks
  values server-side (`usp_LookupList_AssertLabel` / `AssertOption`).

## Input/output safety

- **Stored procedures only** — no inline SQL anywhere. Enforced by ESLint
  (`no-restricted-syntax` on `.query()`/`.batch()`) and a guardrail unit test
  (`src/tests/no-inline-sql.test.ts`) that fails CI on raw SQL in `src/`.
- zod validation at every boundary (env, server actions, repository inputs,
  proc outputs).
- React output encoding; rich-text (notes) sanitised server-side before
  storage and render (allow-list sanitizer — module 15).
- File uploads (module 16): extension + MIME allow-list, size caps, content
  hashing, no execution from the uploads volume, download via streaming route
  with `Content-Disposition: attachment`.

## Security headers

- Per-request **nonce-based CSP** (`script-src 'self' 'nonce-…'
  'strict-dynamic'`, `frame-ancestors 'none'`, `object-src 'none'`,
  `upgrade-insecure-requests`) set in `src/proxy.ts`.
- HSTS (`includeSubDomains; preload`) **production only**; X-Frame-Options
  DENY; nosniff; Referrer-Policy strict-origin-when-cross-origin;
  Permissions-Policy denies camera/microphone/geolocation.

## Audit logging

- `audit.AuditLog` (actor, action, entity, entity id, before/after JSON, IP,
  UTC timestamp) written by **every mutating proc**; admin viewer + search
  procs in module 22. Backup runs and restore rehearsals are recorded via
  `usp_Backup_RecordRun`.

## Secrets management

- Secrets live **only** in GitLab CI/CD variables (masked, protected):
  `MSSQL_SA_PASSWORD`, `AUTH_SECRET`, `PROJECT_TOKEN`, `RENOVATE_TOKEN`,
  optional `GITLAB_TOKEN`. The repo contains `.env.example` placeholders only;
  `.gitignore` excludes `.env*`; **Secret Detection** runs on develop/main.
- The app DB account should move from `sa` to a least-privilege login with
  EXECUTE-only on `usp_*` (module 3 creates `DB_APP_USER`/`DB_APP_PASSWORD`),
  which makes inline SQL impossible at the permission level too.

## Vulnerability management (automatic)

- GitLab **Dependency Scanning + SAST + Secret Detection** on develop/main.
- **Renovate** (scheduled, self-hosted job): security MRs automerged for
  minor/patch (`vulnerabilityAlerts`, `osvVulnerabilityAlerts`).
- **npm-audit-fix** schedule: `npm audit fix` → automatic MR to develop.
- Playbook: security MRs are reviewed/merged first; a red develop pipeline
  from a security scan blocks releases to main.

## Admin module (security management UI — module 22)

Users & roles CRUD, permission assignment, audit-log viewer with filters,
backup status panel, forced password reset, session revocation, settings.
