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
- Login rate limiting ([ADR-0031](adr/ADR-0031-request-gate-internal-routes-and-throttling.md)):
  per-user lockout with exponential backoff (30 s·2^n from the 5th consecutive
  failure, capped at 30 min, `usp_User_RecordLoginAttempt`) is the primary
  control; the SQL fixed window (`auth.LoginAttempt`, `usp_LoginAttempt_Record`,
  atomic + self-purging) is 5/min per known client IP and a shared 60/min when
  no client IP is known (`TRUSTED_PROXY_COUNT=0`). An unknown username is
  verified against a dummy argon2id hash so timing does not reveal it.
- Throttling (ADR-0031): Server Actions 240/min/user (`action()` returns
  `RATE_LIMITED`), CSV/PDF exports 20/min/user (HTTP 429 + `Retry-After`),
  in-process fixed windows in `src/lib/rate-limit.ts`; `RATE_LIMIT_*_PER_MINUTE`
  tunes them, 0 turns one off.
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
- React output encoding; rich text sanitised server-side before storage and
  again on render ([ADR-0025](adr/ADR-0025-rich-text-editor-and-sanitiser.md):
  sanitize-html allow-list in `src/lib/rich-text/sanitize.ts`, applied by
  `richTextSchema` inside `action()` and by `RichTextView`). HTML is injected
  only by `RichTextView` and the theme script (guardrail
  `src/tests/rich-text-boundaries.test.ts`).
- File uploads (module 16, [ADR-0026](adr/ADR-0026-file-storage.md)):
  - Types are decided by magic bytes (Office files by their ZIP directory,
    macros refused), and the extension must agree; 25 MB cap enforced while
    streaming; per-project quota in the AddFile proc (50006).
  - Bytes live outside the web root and SQL, named by SHA-256 in `UPLOADS_DIR`;
    stored paths are CHECK-constrained to the hash shape, so no row can point
    elsewhere. Names are display-only and cleaned of separators and control
    characters.
  - Every `/api/files` route is outside the proxy (so uploads can stream) and
    is built with `fileRoute`. That applies the proxy's gate: same-origin for
    anything but GET/HEAD, and a session (refused while a password change is
    pending). A guardrail test fails any route file there that is not.
  - `POST /api/files`: the owner's access proc and a free-space floor BEFORE
    the body is read. Viewers and outsiders get 404.
  - `GET /api/files/<id>`:
    - the owner's read check, with 404 for anything not visible;
    - the stored file's size and SHA-256 are checked, and changed bytes never
      arrive complete;
    - headers: `Content-Disposition: attachment` (RFC 8187 name), `nosniff`,
      `no-store`, `default-src 'none'; sandbox`.
  - AV-scan hook stub (`src/lib/files/scan.ts`); orphan sweep Admin-only.

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

- Production secrets live in the host's `.env` (server edition) or
  `%ProgramData%\Project Manager\machine.json` (desktop; see DESKTOP.md
  "Security notes" for its trust boundary). CI uses throwaway values on
  ephemeral containers and, where a real one is needed, GitHub Actions secrets
  (`MSSQL_SA_PASSWORD` for the backup rehearsal). The repo contains
  `.env.example` placeholders only; `.gitignore` excludes `.env*`; GitHub secret
  scanning is on for the repository.
- The server edition still connects as `sa`; moving it to a least-privilege
  login with EXECUTE-only on `usp_*` is open (the desktop edition already uses
  `pm_app`, dbcreator + db_owner, not sysadmin).

## Vulnerability management (automatic)

- `.github/workflows/security.yml`: **CodeQL** weekly and on every push to
  develop/main; `npm audit --audit-level=high` fails the workflow on a high or
  critical advisory (no `|| true`).
- `.github/dependabot.yml`: weekly npm and GitHub Actions PRs against develop
  (minors and patches grouped, majors by hand per ADR-0014); security PRs as
  advisories land.
- Supply chain: every third-party action is pinned to a commit SHA; the default
  `GITHUB_TOKEN` is read-only at workflow level (CodeQL adds
  `security-events: write`, the desktop release job its own `contents: write`).
  The desktop installer is **not code-signed** (no certificate yet); the
  updater's only integrity check is the sha512 in the release's `latest.yml`,
  so write access to GitHub releases equals code execution on every client PC.
  Protected branches and the two-maintainer release rule are the control until
  a certificate exists.
- Playbook: security PRs are reviewed/merged first; a red develop run from a
  security workflow blocks releases to main.

## Operator runbook: reset a password or unlock an account (until module 22)

There is no admin UI yet. On the host (server edition) or the PC (desktop):

1. Hash the new password without putting it on a command line:
   `NEW_PW='<password>' node scripts/hash-password.mjs NEW_PW` (any machine
   with Node and the `argon2` package).
2. Apply it with the proc, which also clears the lockout, forces a change at
   next login and revokes every session (`SessionVersion + 1`):

   ```sql
   DECLARE @UserId INT = (SELECT UserId FROM auth.[User] WHERE Username = N'<username>');
   EXEC dbo.usp_User_SetPassword @UserId = @UserId, @PasswordHash = N'<hash>',
        @MustChangePassword = 1, @ActorUserId = <acting admin's UserId>;
   ```

   To unlock without changing the password:
   `UPDATE auth.[User] SET FailedLoginCount = 0, LockedUntilUtc = NULL WHERE UserId = @UserId;`
   To sign someone out everywhere:
   `EXEC dbo.usp_User_BumpSessionVersion @UserId = @UserId, @ActorUserId = <acting admin's UserId>;`
   (the actor id is what the audit row records).
3. Tell the person the temporary password out of band; the proxy forces
   `/change-password` on their next login.

## Admin module (security management UI — module 22)

Users & roles CRUD, permission assignment, audit-log viewer with filters,
backup status panel, forced password reset, session revocation, settings.
