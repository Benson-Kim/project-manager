# Security Design & Management

Authoritative security reference for the Project Manager rebuild.
Roles/permissions matrix: [`PLAN.md`](PLAN.md) §9. Runtime pieces land with
modules 3 (auth) and 22 (admin); the platform pieces below are live from the
foundation module.

## Authentication & sessions

- **Auth.js (NextAuth)** credentials provider — module `auth-and-rbac` (#4).
  Note: `next-auth@4.24.x` is the npm `latest` tag; v5 (`@auth/core`-based) is
  still beta. The auth module evaluates at implementation time and documents
  the choice; the requirement "latest packages" is met by taking the latest
  **stable** dist-tag.
- Password hashing: **bcrypt (cost ≥ 12) or argon2id** — decided in module 3
  by what compiles cleanly in the standalone/Alpine build; stored in
  `auth.User.PasswordHash`, never logged.
- DB-backed sessions (`auth.Session`), `SameSite=Lax`, `HttpOnly`, `Secure`
  cookies; absolute + idle expiry; logout revokes server-side.
- Login rate limiting + lockout with backoff; all auth events audit-logged
  (Login, LoginFailed, Logout, PasswordChange).

## Authorization (RBAC)

- Roles Admin / ProjectManager / Contributor / Viewer (`auth.Role`,
  `auth.UserRole`, `auth.Permission`).
- Enforced in three layers:
  1. Route guard — `src/proxy.ts` + protected layouts redirect
     unauthenticated/unauthorised users.
  2. Server-action guard — every action asserts the required permission before
     calling a repository.
  3. Stored-proc guard — mutating procs take `@ActorUserId` and validate
     permission server-side (defence in depth), then write `audit.AuditLog`.

## Input/output safety

- **Stored procedures only** — no inline SQL anywhere. Enforced by ESLint
  (`no-restricted-syntax` on `.query()`/`.batch()`) and a guardrail unit test
  (`src/test/no-inline-sql.test.ts`) that fails CI on raw SQL in `src/`.
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
