# Restore Runbook — Database & Uploaded Files

Design: [ADR-0032](adr/ADR-0032-deployment-topology-and-backups.md) (incl.
RPO/RTO in [`PLAN.md`](PLAN.md) §5). This runbook is for the **server edition**
(Docker Compose); the desktop edition's backups are described in
[`DESKTOP.md`](DESKTOP.md).

A backup set is produced by `scripts/backup.sh`: SQL Server native **full +
differential + log** backups (`ProjectManager-full-<stamp>.bak.gz`,
`-diff-`, `-log-<stamp>.trn.gz`) plus `uploads-<stamp>.tar.gz` for attachments,
where `<stamp>` is the UTC time `YYYYMMDD-HHMMSS`. They land in
`BACKUP_OUT_DIR` on the host; `BACKUP_UPLOAD_CMD`, when set, copies each file
off-site.

## 0. Operator duties

1. **Run the backup daily** from the host, e.g. a cron entry (the Compose stack
   mounts `./backups` into the SQL container, so `BACKUP_DIR` is the server's
   view of the same folder):

   ```sh
   # /etc/cron.d/projectmanager-backup
   15 2 * * * pm cd /opt/projectmanager && \
     DB_SERVER=localhost DB_ADMIN_PASSWORD="$MSSQL_SA_PASSWORD" \
     BACKUP_DIR=/var/opt/mssql/backup BACKUP_OUT_DIR=/opt/projectmanager/backups \
     UPLOADS_DIR=/opt/projectmanager/uploads \
     BACKUP_UPLOAD_CMD="rclone copy --no-traverse --include-from /dev/null" \
     sh scripts/backup.sh >> /var/log/projectmanager-backup.log 2>&1
   ```

   Pick the upload command for your target; it is run once per file with the
   file path as its last argument (`rclone copy <file> remote:pm-backups`,
   `az storage blob upload -f <file> …`, `cp <file> /mnt/offsite`). Watch the
   log: a failing run exits non-zero.
2. **Test a restore quarterly** with §2 side-by-side into `PM_Verify`.
3. **Keep the secrets** (`.env`: `MSSQL_SA_PASSWORD`, `DB_APP_PASSWORD`,
   `AUTH_SECRET`) somewhere that survives the host: a restored database is
   useless without the auth secret only for open sessions (people sign in
   again), but the sa password is needed to restore at all, and the app
   login's password to let the app back in (§2).

## 1. Find the backup set

```sh
ls -1 backups/ | grep full | sort | tail -5        # local sets, newest last
```

If the host is gone, copy the newest set back from the off-site target into a
folder and point `BACKUP_SOURCE_DIR` at it.

## 2. Restore the database

Run **on the SQL Server host** (or `docker compose exec mssql sh` with the
repo's `backups/` volume mounted; the script copies the set into `$BACKUP_DIR`
and executes the NORECOVERY chain full → diff → log):

```sh
export DB_SERVER=localhost DB_ADMIN_USER=sa DB_ADMIN_PASSWORD=... \
       BACKUP_DIR=/var/opt/mssql/backup BACKUP_SOURCE_DIR=./backups
sh scripts/restore.sh <stamp>            # restore over ProjectManager
sh scripts/restore.sh <stamp> PM_Verify  # or restore side-by-side first
```

Order enforced by the script: `RESTORE DATABASE ... full WITH NORECOVERY` →
`diff WITH NORECOVERY` → `RESTORE LOG ... WITH RECOVERY` (diff/log optional —
the script degrades gracefully), then `MULTI_USER`.

**Onto a new SQL Server** (the old one is gone), the database's `pm_web` user
has no matching login there and the app cannot sign in. Recreate the login and
re-map the user (ADR-0033), then restart the app container:

```sh
DB_APP_USER=pm_web DB_APP_PASSWORD="$DB_APP_PASSWORD" sh scripts/db-apply.sh --login-only
```

A **desktop** database restored onto the server also brings its `pm_app` user
(db_owner, no login here); drop it once:
`sqlcmd -S localhost -U sa -P "$DB_ADMIN_PASSWORD" -C -d ProjectManager -Q "DROP USER IF EXISTS pm_app;"`

## 3. Restore uploaded files

```sh
BACKUP_SOURCE_DIR=./backups sh scripts/restore-files.sh <stamp> /path/to/uploads
```

Point the app's `UPLOADS_DIR` (compose volume `uploads`) at the restored
directory and restart the app container.

## 4. Verify after restore

```sh
sqlcmd -S localhost -U sa -P "$DB_ADMIN_PASSWORD" -C -Q "
  SELECT COUNT(*) FROM ProjectManager.app.SchemaMigrations;
  SELECT COUNT(*) FROM ProjectManager.app.ActivityStatus;
  SELECT TOP 5 * FROM ProjectManager.audit.AuditLog ORDER BY AuditLogId DESC;"
```

- App starts and login works.
- Spot-check one record per module against expectations.
- Record the restore in the audit log / backup status (module 22).

## 5. Rehearsal (automated proof)

`.github/workflows/backup.yml` runs `scripts/backup.sh` and then
`scripts/restore-rehearsal.sh` every night against a seeded throwaway
container: the just-taken set is restored into `ProjectManager_Rehearsal`,
asserted ONLINE with sanity counts, then dropped. A red run means the scripts
or the chain broke, not that a production backup failed: production backups
are the host cron's log. Run the rehearsal script manually any time against a
server that holds the backup files.

## 6. Disaster scenarios

| Scenario | Action |
|---|---|
| Bad deploy / data corruption | Restore latest set side-by-side (`PM_Verify`), verify, then swap (restore over `ProjectManager`). |
| Server/volume lost | New SQL Server container → copy the set back from off-site → `scripts/restore.sh <latest>` → `scripts/restore-files.sh <latest>` → `scripts/db-apply.sh --login-only` (§2) → point app at it. RTO ≤ 30 min. |
| Off-site target unavailable | The local `BACKUP_OUT_DIR` holds the last `BACKUP_RETAIN_DAYS` (30) days of sets. |
| Need point-in-time | Restore full+diff `WITH NORECOVERY`, then `RESTORE LOG ... WITH STOPAT = '<utc-time>', RECOVERY`. |
