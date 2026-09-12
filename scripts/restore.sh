#!/bin/sh
# Restore the database from a backup package version created by scripts/backup.sh.
# Usage: scripts/restore.sh <version-stamp> [target-db-name]
# Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD,
#      CI_API_V4_URL, CI_PROJECT_ID, and GITLAB_TOKEN or CI_JOB_TOKEN.
# Full runbook: docs/RESTORE-RUNBOOK.md (file-storage-and-backup module).
set -eu

VERSION="${1:?usage: restore.sh <version-stamp> [target-db]}"
TARGET_DB="${2:-ProjectManager}"
DB_SERVER="${DB_SERVER:-mssql}"
DB_PORT="${DB_PORT:-1433}"
DB_USER="${DB_USER:-sa}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
API="${CI_API_V4_URL:-https://gitlab.com/api/v4}"
: "${CI_PROJECT_ID:?CI_PROJECT_ID is required}"

AUTH_HEADER="JOB-TOKEN: ${CI_JOB_TOKEN:-}"
[ -n "${GITLAB_TOKEN:-}" ] && AUTH_HEADER="PRIVATE-TOKEN: $GITLAB_TOKEN"

WORK="restore-$VERSION"
mkdir -p "$WORK"

# List and download every file of the package version.
pkg_files=$(curl --fail -s --header "$AUTH_HEADER" \
  "$API/projects/$CI_PROJECT_ID/packages/generic/project-manager-backups/$VERSION/" 2>/dev/null || true)
for name in "$TARGET_DB-full-$VERSION.bak.gz" "$TARGET_DB-diff-$VERSION.bak.gz" "$TARGET_DB-log-$VERSION.trn.gz"; do
  curl --fail -s --header "$AUTH_HEADER" -o "$WORK/$name" \
    "$API/projects/$CI_PROJECT_ID/packages/generic/project-manager-backups/$VERSION/$name" || true
done
gunzip -f "$WORK"/*.gz 2>/dev/null || true

BK_DIR="${BACKUP_DIR:-/var/opt/mssql/data}"
cp "$WORK"/*.bak "$BK_DIR/" 2>/dev/null || true
cp "$WORK"/*.trn "$BK_DIR/" 2>/dev/null || true

sqlrun() { sqlcmd -S "tcp:${DB_SERVER},${DB_PORT}" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -Q "$1"; }

sqlrun "IF DB_ID(N'$TARGET_DB') IS NOT NULL ALTER DATABASE [$TARGET_DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;"
if [ -f "$WORK/$TARGET_DB-diff-$VERSION.bak" ]; then
  sqlrun "RESTORE DATABASE [$TARGET_DB] FROM DISK = N'$BK_DIR/$TARGET_DB-full-$VERSION.bak' WITH NORECOVERY, REPLACE;"
  if [ -f "$WORK/$TARGET_DB-log-$VERSION.trn" ]; then
    sqlrun "RESTORE DATABASE [$TARGET_DB] FROM DISK = N'$BK_DIR/$TARGET_DB-diff-$VERSION.bak' WITH NORECOVERY;"
    sqlrun "RESTORE LOG [$TARGET_DB] FROM DISK = N'$BK_DIR/$TARGET_DB-log-$VERSION.trn' WITH RECOVERY;"
  else
    sqlrun "RESTORE DATABASE [$TARGET_DB] FROM DISK = N'$BK_DIR/$TARGET_DB-diff-$VERSION.bak' WITH RECOVERY;"
  fi
else
  sqlrun "RESTORE DATABASE [$TARGET_DB] FROM DISK = N'$BK_DIR/$TARGET_DB-full-$VERSION.bak' WITH RECOVERY, REPLACE;"
fi
sqlrun "ALTER DATABASE [$TARGET_DB] SET MULTI_USER;"

echo "Restore of $TARGET_DB from version $VERSION complete."
