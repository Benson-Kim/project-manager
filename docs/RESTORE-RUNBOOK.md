# Restore Runbook — Database & Uploaded Files

Zero-cost backup design: [`PLAN.md`](PLAN.md) §5 (incl. RPO/RTO).
Backups are produced by the scheduled `backup` CI job
(`SCHEDULE_JOB=backup`): SQL Server native **full + differential + log**
backups, pulled off-server and uploaded to the **Generic Package Registry**
(package `project-manager-backups`, version = UTC timestamp
`YYYYMMDD-HHMMSS`), plus `uploads-<stamp>.tar.gz` for files. Every scheduled
run also executes `scripts/restore-rehearsal.sh` — an automatic restore test
with sanity queries; a failed rehearsal fails the pipeline (alert!).

## 1. Find the backup version

Project ▸ Deploy ▸ Package Registry ▸ `project-manager-backups` — pick the
version stamp (latest = most recent). Or via API:

```sh
glab api "projects/<id>/packages?package_name=project-manager-backups" \
  | jq -r '.[].version' | sort | tail -5
```

## 2. Restore the database

Run **on the SQL Server host** (or `docker compose exec mssql sh` with the
repo's `backups/` volume mounted; the script downloads the set, copies it to
`$BACKUP_DIR` and executes the NORECOVERY chain full → diff → log):

```sh
export DB_SERVER=localhost DB_USER=sa DB_PASSWORD=... \
       CI_PROJECT_ID=<id> GITLAB_TOKEN=<token-with-read_api>
sh scripts/restore.sh <version-stamp>            # restore over ProjectManager
sh scripts/restore.sh <version-stamp> PM_Verify  # or restore side-by-side first
```

Order enforced by the script: `RESTORE DATABASE ... full WITH NORECOVERY` →
`diff WITH NORECOVERY` → `RESTORE LOG ... WITH RECOVERY` (diff/log optional —
the script degrades gracefully), then `MULTI_USER`.

## 3. Restore uploaded files

```sh
sh scripts/restore-files.sh <version-stamp> /path/to/uploads
```

Point the app's `UPLOADS_DIR` (compose volume `uploads`) at the restored
directory and restart the app container.

## 4. Verify after restore

```sh
sqlcmd -S localhost -U sa -P "$DB_PASSWORD" -C -Q "
  SELECT COUNT(*) FROM ProjectManager.app.SchemaMigrations;
  SELECT COUNT(*) FROM ProjectManager.app.ActivityStatus;
  SELECT TOP 5 * FROM ProjectManager.audit.AuditLog ORDER BY AuditLogId DESC;"
```

- App starts and login works (once auth module is live).
- Spot-check one record per module against expectations.
- Record the restore in the audit log / backup status (module 22).

## 5. Rehearsal (automated proof)

`scripts/restore-rehearsal.sh` runs after every scheduled backup: restores the
just-taken set into `ProjectManager_Rehearsal` on the same server, asserts the
DB comes ONLINE and sanity counts pass, then drops it. Run it manually anytime
against any server that holds the backup files.

## 6. Disaster scenarios

| Scenario | Action |
|---|---|
| Bad deploy / data corruption | Restore latest set side-by-side (`PM_Verify`), verify, then swap (restore over `ProjectManager`). |
| Server/volume lost | New SQL Server container → `scripts/restore.sh <latest>` → `scripts/restore-files.sh <latest>` → point app at it. RTO ≤ 30 min. |
| Registry unavailable | Latest set is also attached as pipeline artifacts (14-day expiry) on scheduled backup pipelines. |
| Need point-in-time | Restore full+diff `WITH NORECOVERY`, then `RESTORE LOG ... WITH STOPAT = '<utc-time>', RECOVERY`. |
