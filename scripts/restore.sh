#!/bin/sh
# Restore the database from a backup set created by scripts/backup.sh (ADR-0032).
# Usage: scripts/restore.sh <version-stamp> [target-db-name]
# Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, SOURCE_DB (name used in the
#      backup filenames, default ProjectManager), BACKUP_DIR (the server's folder),
#      BACKUP_SOURCE_DIR (where the gzipped set is, default BACKUP_OUT_DIR or
#      ./backups; copy it back from off-site first if needed).
#
# IMPORTANT: RESTORE reads files from the SQL Server host's own disk, so this
# script must run WHERE $BACKUP_DIR is the server's directory — on the DB host
# itself, or via `docker compose exec mssql` with the backups volume mounted.
# For an automated in-CI proof of restorability, see scripts/restore-rehearsal.sh.
# Full runbook: docs/RESTORE-RUNBOOK.md.
set -eu

VERSION="${1:?usage: restore.sh <version-stamp> [target-db]}"
TARGET_DB="${2:-ProjectManager}"
SOURCE_DB="${SOURCE_DB:-ProjectManager}"
DB_SERVER="${DB_SERVER:-mssql}"
DB_PORT="${DB_PORT:-1433}"
DB_USER="${DB_USER:-sa}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
SRC="${BACKUP_SOURCE_DIR:-${BACKUP_OUT_DIR:-backups}}"

WORK="restore-$VERSION"
mkdir -p "$WORK"

# Copy every file of the backup set (full is mandatory, diff/log optional).
for name in "$SOURCE_DB-full-$VERSION.bak.gz" "$SOURCE_DB-diff-$VERSION.bak.gz" "$SOURCE_DB-log-$VERSION.trn.gz"; do
  [ -f "$SRC/$name" ] && cp "$SRC/$name" "$WORK/$name"
done
[ -f "$WORK/$SOURCE_DB-full-$VERSION.bak.gz" ] || { echo "ERROR: full backup for $VERSION not found in $SRC"; exit 1; }
gunzip -f "$WORK"/*.gz

BK_DIR="${BACKUP_DIR:-/var/opt/mssql/data}"
cp "$WORK"/*.bak "$BK_DIR/" || { echo "ERROR: cannot copy backups into $BK_DIR — run this on the DB host (see header)"; exit 1; }
cp "$WORK"/*.trn "$BK_DIR/" 2>/dev/null || true

sqlrun() { sqlcmd -S "tcp:${DB_SERVER},${DB_PORT}" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -Q "$1"; }

sqlrun "IF DB_ID(N'$TARGET_DB') IS NOT NULL ALTER DATABASE [$TARGET_DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;"
if [ -f "$WORK/$SOURCE_DB-diff-$VERSION.bak" ]; then
  sqlrun "RESTORE DATABASE [$TARGET_DB] FROM DISK = N'$BK_DIR/$SOURCE_DB-full-$VERSION.bak' WITH NORECOVERY, REPLACE;"
  if [ -f "$WORK/$SOURCE_DB-log-$VERSION.trn" ]; then
    sqlrun "RESTORE DATABASE [$TARGET_DB] FROM DISK = N'$BK_DIR/$SOURCE_DB-diff-$VERSION.bak' WITH NORECOVERY;"
    sqlrun "RESTORE LOG [$TARGET_DB] FROM DISK = N'$BK_DIR/$SOURCE_DB-log-$VERSION.trn' WITH RECOVERY;"
  else
    sqlrun "RESTORE DATABASE [$TARGET_DB] FROM DISK = N'$BK_DIR/$SOURCE_DB-diff-$VERSION.bak' WITH RECOVERY;"
  fi
else
  sqlrun "RESTORE DATABASE [$TARGET_DB] FROM DISK = N'$BK_DIR/$SOURCE_DB-full-$VERSION.bak' WITH RECOVERY, REPLACE;"
fi
sqlrun "ALTER DATABASE [$TARGET_DB] SET MULTI_USER;"

echo "Restore of $TARGET_DB from version $VERSION complete."
