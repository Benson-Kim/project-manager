# ADR-0071 — Recover the desktop database inside Modulus

Date: 2026-11-19
Status: Accepted

## Context

On an installed Windows PC, sign-in reports that the database is unavailable while
the watchdog repeatedly fails to start `MSSQL$PROJECTMGR`. Startup waits for a
stopped service without asking Windows to start it. The watchdog only recognises
running/stopped/missing, so a service still starting is treated as stopped. Older
PCs can lack the service permission needed for automatic recovery because upgrades
skip provisioning when machine.json already exists.

Users must be able to recover from the app, including before they can sign in.
No console commands, Windows service management or computer restart are part of
the recovery flow. A damaged installation can still require support; the app must
state that honestly and make diagnostics easy to copy.

## Decision

- Share one recovery coordinator across startup, the watchdog, resume and sign-in.
  Join concurrent requests, start only a stopped service, wait through pending
  states and prove that SQL accepts the configured login before reporting success.
- Keep the watchdog's healthy-path TCP probe inexpensive. A sign-in request always
  waits for authenticated readiness before submitting credentials to Auth.js.
  Recovery never repeats a sign-in or any other database mutation automatically.
- Expose a no-argument `desktop.ensureDatabase()` bridge. Only top-level frames
  belonging to the current local app server may invoke it. Credentials, target
  service names and commands never cross this bridge.
- If normal recovery fails, offer Repair connection in a native app dialog.
  A service-only mode of the existing elevated provisioning script repairs the
  service start permissions and failure recovery, makes startup automatic and
  starts the existing instance. It does not configure logins or rewrite machine
  configuration. Windows may ask for administrator approval on an older PC.
- Preserve the service security descriptor and grant interactive users only query
  status and start rights on this instance. Do not grant stop/configure rights.
  Report command exit codes and output to the rotating log for support.
- Offer repair once per outage from the background watchdog; an explicit sign-in
  can retry. Report failed or declined repair in plain language and provide Copy
  support details. Diagnostics contain no database passwords or sign-in secrets.
- Preserve open pages and form values after recovery. The next sign-in proceeds
  automatically once recovery succeeds. Browser deployments keep their normal
  authentication path because they have no desktop bridge.

This extends the recovery policy documented in DESKTOP.md and supersedes the
watchdog fallback that told users to restart the computer or run setup themselves.
It adds no dependency or database migration.

## Validation

Regression coverage exercises service states and Windows error codes, concurrent
recovery, pending services, access denial, repair cancellation/failure, origin and
frame checks, and sign-in preflight. Windows acceptance must cover a standard user
with and without service-start permission, a stopped service, resume and a declined
administrator prompt. Unit tests cannot prove Windows service behaviour.
