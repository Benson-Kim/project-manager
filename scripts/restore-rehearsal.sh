#!/bin/sh
# Restore rehearsal: prove the latest backup chain is restorable.
# Runs right after scripts/backup.sh in the scheduled backup pipeline:
# restores full -> diff -> log (NORECOVERY chain) into a scratch database on
# the same server (the backup files are still on the server's disk), then
# runs sanity queries. Backups are only real if restores are tested.
#
# Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, BACKUP_DIR.
set -eu

DB_SERVER="${DB_SERVER:-mssql}"
DB_PORT="${DB_PORT:-1433}"
DB_USER="${DB_USER:-sa}"
DB_NAME="${DB_NAME:-ProjectManager}"
REHEARSAL_DB="${REHEARSAL_DB:-${DB_NAME}_Rehearsal}"
BK_DIR="${BACKUP_DIR:-/var/opt/mssql/data}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"

sqlrun() { sqlcmd -S "tcp:${DB_SERVER},${DB_PORT}" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -Q "$1"; }
sqlval() { sqlcmd -S "tcp:${DB_SERVER},${DB_PORT}" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -h -1 -W -Q "SET NOCOUNT ON; $1" | tr -d '[:space:]'; }

# Latest backup set on the server for this DB.
STAMP="$(sqlval "SELECT TOP 1 REPLACE(REPLACE(b.name,'$DB_NAME-full-',''),'.bak','') FROM (SELECT physical_device_name AS name FROM msdb.dbo.backupmediafamily) b WHERE b.name LIKE '%$DB_NAME-full-%' ORDER BY b.name DESC;")"
STAMP="$(basename "$STAMP")"
[ -n "$STAMP" ] || { echo "ERROR: no full backup found on server"; exit 1; }
echo "Rehearsing restore of backup set $STAMP into [$REHEARSAL_DB]"

FULL="$BK_DIR/${DB_NAME}-full-$STAMP.bak"
DIFF="$BK_DIR/${DB_NAME}-diff-$STAMP.bak"
LOG="$BK_DIR/${DB_NAME}-log-$STAMP.trn"

sqlrun "IF DB_ID(N'$REHEARSAL_DB') IS NOT NULL BEGIN ALTER DATABASE [$REHEARSAL_DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$REHEARSAL_DB]; END"
sqlrun "RESTORE DATABASE [$REHEARSAL_DB] FROM DISK = N'$FULL' WITH NORECOVERY, \
  MOVE '$DB_NAME'     TO N'$BK_DIR/${REHEARSAL_DB}.mdf', \
  MOVE '${DB_NAME}_log' TO N'$BK_DIR/${REHEARSAL_DB}_log.ldf', REPLACE;"
sqlrun "RESTORE DATABASE [$REHEARSAL_DB] FROM DISK = N'$DIFF' WITH NORECOVERY;"
sqlrun "RESTORE LOG [$REHEARSAL_DB] FROM DISK = N'$LOG' WITH RECOVERY;"

# Sanity checks: DB online, schema + data present.
STATE="$(sqlval "SELECT state_desc FROM sys.databases WHERE name = N'$REHEARSAL_DB';")"
[ "$STATE" = "ONLINE" ] || { echo "ERROR: rehearsal DB state=$STATE"; exit 1; }
MIGS="$(sqlval "SELECT COUNT(*) FROM [$REHEARSAL_DB].app.SchemaMigrations;")"
STATUSES="$(sqlval "SELECT COUNT(*) FROM [$REHEARSAL_DB].app.ActivityStatus;")"
echo "Sanity: state=ONLINE migrations=$MIGS activity statuses=$STATUSES"
[ "$MIGS" -ge 1 ] && [ "$STATUSES" -ge 4 ] || { echo "ERROR: sanity counts too low"; exit 1; }

sqlrun "DROP DATABASE [$REHEARSAL_DB];"
echo "Restore rehearsal PASSED for backup set $STAMP."
