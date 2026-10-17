# ADR-0033 — The server edition's app connects as an EXECUTE-only login

Status: Accepted · Date: 2026-10-16 · Session: financials hand-off, open item from the whole-codebase review
Amends ADR-0032 (server configuration) and the "Secrets" section of SECURITY.md.

## Context

ADR-0002 routes every data access through stored procedures, and the guardrails prove the app's
code never sends anything else. The database did not hold the app to it: docker-compose gave the
Next.js container `sa` and the sa password. Any flaw that let an attacker run a query of their
choosing inside the app process (a future inline query, a compromised dependency in the server
bundle, a remote-code bug in Next.js) would have been sysadmin on the SQL Server: run commands on
the database host (`xp_cmdshell` once enabled), read its files (`OPENROWSET(BULK …)`), create
logins, reach every other database on the instance, drop or alter the schema, and read or rewrite
any table, `audit.AuditLog` included, with nothing audited.

The desktop edition already left sysadmin behind (`pm_app`, db_owner + dbcreator, ADR-0032): it
creates and migrates its own database at startup, and every local account can read
`machine.json`, so a second, smaller login would add nothing there.

## Decision

1. **Role `app_executor`**: `GRANT EXECUTE ON SCHEMA::dbo` and nothing else. Every proc and
   function lives in `dbo`; every schema (`app`, `auth`, `audit`, `dbo`) is owned by `dbo`, so a
   proc reaches its tables by ownership chaining and its caller needs no table right at all. New
   procs are covered by the schema grant without a per-proc step.
2. **Login `pm_web`** (`DB_APP_USER`, default `pm_web`; password `DB_APP_PASSWORD`): a SQL login
   with `CHECK_POLICY = ON`, a user in the database with default schema `dbo`, member of
   `app_executor` only. It holds no server role, no database role, no permission of its own
   besides CONNECT, and owns nothing.
3. **Applied and asserted by `scripts/db-apply.sh`** (`db/security/app-login.sql`, after the
   procs and seeds, as the admin login). It creates the login, resets its password when the
   value differs (`PWDCOMPARE`), re-maps an orphaned user after a restore onto another server,
   and fails the apply when the role or the login holds anything beyond decision 1-2 (a right
   granted by hand is an error, not drift). `db-apply.sh --login-only` runs just this step. It is
   not a migration: it carries a secret, must re-run for rotation, and the desktop never runs it.
4. **Two credential pairs that cannot be confused.** `DB_USER` / `DB_PASSWORD` are the app's
   login everywhere (Next.js, docker-compose, `db/tests`). The operator's scripts (`db-apply.sh`,
   `backup.sh`, `restore.sh`, `restore-rehearsal.sh`) read only `DB_ADMIN_USER` (default `sa`) and
   `DB_ADMIN_PASSWORD` (default `MSSQL_SA_PASSWORD`), so sourcing `.env` points each at its own.
5. **Procs stay static SQL.** Dynamic SQL (`sp_executesql`, `EXEC (@sql)`) and `EXECUTE AS` would
   break the ownership chain or step around it; a guardrail fails on either.
6. **Proof in CI**: the db-apply job applies twice (the second run rotates the password),
   `db/verify/app_login.sql` impersonates the login and fails on any server, database or object
   right beyond EXECUTE on `dbo` (including a direct read of `auth.User` and a delete from
   `audit.AuditLog`, both refused with 229); the proc behaviour checks (`db/tests`) and the
   Playwright suite connect as `pm_web`, so every proc the app and the checks call is shown to
   work with EXECUTE alone. `src/tests/app-login.test.ts` pins the configuration.

## Consequences

- A query the app should never send now fails with a permission error instead of succeeding as
  sysadmin; the reachable surface is exactly the procs, which check access and audit themselves.
- What it does not change: the procs trust the `@ActorUserId` the app passes (the app is the
  authenticator, ADR-0017), and the login proc returns a user's hash by username. Code running
  inside the app process can therefore still do anything the procs allow, as any user, one proc
  call at a time. The login contains that to the app's own rules and audit trail; it does not
  replace keeping the app process uncompromised.
- The operator keeps one more secret (`DB_APP_PASSWORD`) next to `MSSQL_SA_PASSWORD`. The app
  container's environment no longer holds the sa password; it stays in the host's `.env` for the
  scripts, or wherever else the operator keeps it.
- After restoring onto a new SQL Server the app cannot sign in until `db-apply.sh --login-only`
  recreates the login and re-maps the user (RESTORE-RUNBOOK §2). A desktop database restored onto
  a server brings its `pm_app` user (db_owner) along without a login; the runbook drops it.
- Backups, restores and migrations still need the admin login; only the long-running process
  lost it.
- The desktop edition is unchanged (`pm_app`, db_owner on its own database, ADR-0032).
