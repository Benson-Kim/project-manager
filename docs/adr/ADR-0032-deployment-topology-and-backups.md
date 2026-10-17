# ADR-0032 — Deployment topology and backups

Status: Accepted · Date: 2026-10-16 · Session: whole-codebase review (architecture challenge)
Supersedes the backup design in PLAN.md §5 and the GitLab wording in PLAN §1/§8, STANDARDS §4,
SECURITY.md and RESTORE-RUNBOOK.md.

## Context

The app ships in two editions and the documents never said which one an office should run,
who hosts it, or where its backups go:

- **Desktop** (Electron + private SQL Server Express): one database per PC. Two project managers
  cannot see each other's projects unless they share the PC. Every local Windows account can
  read `machine.json` (the database password and the auth secret), so the PC is the trust
  boundary. The daily backup is copied to the user's OneDrive folder, unencrypted.
- **Server** (Docker Compose: Next.js + SQL Server 2022): shared data, per-user accounts, the
  access levels and audit trail the rest of the design assumes. It needs a host the office
  controls and someone to run it.
- `scripts/backup.sh`, `restore.sh` and the runbook uploaded to the **GitLab** Generic Package
  Registry with a CI job token. The repository is on GitHub; the registry never existed for it.
  `backup.yml` rehearses a backup and restore on an ephemeral container every night, which
  proves the scripts, not that any production database is backed up.

## Decision

1. **Two supported configurations, nothing in between.**
   - *Single-user desktop*: one person, one PC, their own projects. Accepted risks are
     written in DESKTOP.md ("Security notes"): every local account on that PC is trusted,
     backups rely on OneDrive and BitLocker.
   - *Server edition for a team*: one Docker Compose stack on a host the office owns (an
     on-premises VM or a small cloud VM), behind a reverse proxy that terminates TLS, with
     `TRUSTED_PROXY_COUNT=1` and `AUTH_URL` set to the public origin. One process, one
     database: the in-process limits of ADR-0031 and the SQL fixed windows are exact. Nothing
     here scales out, and nothing needs to for a project office.
   - A desktop installation is not migrated to a server by hand: the server edition is
     chosen before data exists on more than one PC, or its database is restored from one
     desktop's `.bak` once (the formats are the same SQL Server).
2. **Backups run on the host, not in CI.** `scripts/backup.sh` writes the full + differential
   + log set and the uploads archive into `BACKUP_OUT_DIR` on the host (a directory the
   operator mounts or syncs). An optional `BACKUP_UPLOAD_CMD` is run with each file's path
   as its argument, so the operator plugs in `rclone copy`, `az storage blob upload`,
   `aws s3 cp` or a network copy without the script knowing the target. Retention is applied
   to the local directory (`BACKUP_RETAIN_DAYS`, default 30); off-site retention belongs to
   the target. A host cron (or a Windows task) calls the script daily; the runbook has the
   lines.
3. **Restore reads from a directory.** `scripts/restore.sh <stamp>` and
   `scripts/restore-files.sh <stamp>` take the set from `BACKUP_SOURCE_DIR` (default
   `BACKUP_OUT_DIR`), after the operator copied it back from off-site if needed. The restore
   chain (full → diff → log, NORECOVERY until the last) is unchanged.
4. **CI keeps the rehearsal.** `backup.yml` still backs up and restores a seeded database on a
   throwaway container every night, which is the only automatic proof that the scripts and
   the chain work. It is not a backup of anything.
5. **Desktop backups** stay as they are (daily verified `.bak`, copied to the user's chosen
   folder). SQL Server Express cannot use `BACKUP … WITH ENCRYPTION` without a certificate
   the user would have to keep somewhere safer than the backup itself; the written
   assumption (OneDrive account protection + BitLocker) is the honest control.

## Consequences

- The office has to pick an edition and, for the server, a host and an owner. The runbook
  names the three operator duties: run the stack, run the backup, test a restore quarterly.
- No secret or token for a package registry; backups need only a directory and, optionally,
  the operator's own upload tool and its credentials, which stay on the host.
- PLAN.md §5 and §8, STANDARDS §4, SECURITY.md "Secrets" and "Vulnerability management",
  README and `.env.example` are corrected to GitHub Actions and this backup design.
- Multi-instance deployment is out of scope; revisiting it would reopen ADR-0031 (shared
  limiter store) and this ADR.
