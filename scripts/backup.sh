#!/bin/sh
# Backup (ADR-0032): SQL Server native BACKUP DATABASE (full + differential +
# transaction log), pulled back over the SQL connection, gzipped into
# BACKUP_OUT_DIR on the host, optionally handed to the operator's own upload
# command for an off-site copy. A host cron runs it daily (docs/RESTORE-RUNBOOK.md);
# .github/workflows/backup.yml runs it nightly against a throwaway container as a
# rehearsal. Restore: scripts/restore.sh / restore-rehearsal.sh.
#
# The backup files are written on the SQL Server host (BACKUP_DIR). The script may
# run anywhere that reaches the SQL port: each file is pulled back via
# OPENROWSET(BULK ..., SINGLE_BLOB) as hex and decoded locally — binary-safe and
# needs nothing but sqlcmd + xxd.
#
# Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME,
#      BACKUP_DIR (server-side folder SQL Server writes to, default /var/opt/mssql/data),
#      BACKUP_OUT_DIR (local folder for the gzipped set, default ./backups),
#      BACKUP_UPLOAD_CMD (optional: a command run once per file with the file path as
#        its last argument, e.g. "rclone copy --no-traverse" + " remote:pm-backups" via
#        a wrapper, "az storage blob upload-batch", "cp -t /mnt/offsite"),
#      BACKUP_RETAIN_DAYS (local retention, default 30; off-site retention is the
#        target's), UPLOADS_DIR (optional app uploads dir, tarred into the set).
set -eu

DB_SERVER="${DB_SERVER:-mssql}"
DB_PORT="${DB_PORT:-1433}"
DB_USER="${DB_USER:-sa}"
DB_NAME="${DB_NAME:-ProjectManager}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="${BACKUP_OUT_DIR:-backups}"
BK_DIR="${BACKUP_DIR:-/var/opt/mssql/data}"
mkdir -p "$OUT"

sqlrun() { sqlcmd -S "tcp:${DB_SERVER},${DB_PORT}" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -Q "$1"; }

# Pull a server-side file back over the SQL connection (binary-safe hex dump).
pull() { # $1 = server path, $2 = local path
  sqlcmd -S "tcp:${DB_SERVER},${DB_PORT}" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -h -1 -y 0 \
    -Q "SET NOCOUNT ON; SELECT sys.fn_varbintohexstr(BulkColumn) FROM OPENROWSET(BULK N'$1', SINGLE_BLOB) AS f;" \
    | tr -d '[:space:]' | sed 's/^0x//' | xxd -r -p > "$2"
  [ -s "$2" ] || { echo "ERROR: pulled empty file from $1" >&2; exit 1; }
  echo "pulled $1 -> $2 ($(wc -c < "$2") bytes)"
}

FULL="$BK_DIR/${DB_NAME}-full-$STAMP.bak"
DIFF="$BK_DIR/${DB_NAME}-diff-$STAMP.bak"
LOG="$BK_DIR/${DB_NAME}-log-$STAMP.trn"

# Full recovery model so the log chain exists (no-op if already FULL).
sqlrun "IF (SELECT recovery_model FROM sys.databases WHERE name = N'$DB_NAME') <> 1 ALTER DATABASE [$DB_NAME] SET RECOVERY FULL;"

sqlrun "BACKUP DATABASE [$DB_NAME] TO DISK = N'$FULL' WITH INIT, COMPRESSION, CHECKSUM;"
sqlrun "BACKUP DATABASE [$DB_NAME] TO DISK = N'$DIFF' WITH DIFFERENTIAL, COMPRESSION, CHECKSUM;"
sqlrun "BACKUP LOG [$DB_NAME] TO DISK = N'$LOG' WITH COMPRESSION, CHECKSUM;"

pull "$FULL" "$OUT/${DB_NAME}-full-$STAMP.bak"
pull "$DIFF" "$OUT/${DB_NAME}-diff-$STAMP.bak"
pull "$LOG"  "$OUT/${DB_NAME}-log-$STAMP.trn"

# Include uploaded files if present.
if [ -n "${UPLOADS_DIR:-}" ] && [ -d "${UPLOADS_DIR:-}" ]; then
  tar czf "$OUT/uploads-$STAMP.tar.gz" -C "$UPLOADS_DIR" .
fi

gzip -f "$OUT/${DB_NAME}-full-$STAMP.bak" "$OUT/${DB_NAME}-diff-$STAMP.bak" "$OUT/${DB_NAME}-log-$STAMP.trn"

# Off-site copy: the operator's command, once per file of this set.
if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  for f in "$OUT"/*"$STAMP"*; do
    [ -f "$f" ] || continue
    sh -c "$BACKUP_UPLOAD_CMD \"\$0\"" "$f"
    echo "uploaded $(basename "$f")"
  done
fi

# Local retention: sets older than BACKUP_RETAIN_DAYS are deleted here; the
# off-site target keeps its own.
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"
find "$OUT" -maxdepth 1 -type f \( -name "${DB_NAME}-*.gz" -o -name "uploads-*.tar.gz" \) -mtime +"$RETAIN_DAYS" -print -delete \
  | sed 's/^/pruned /' || true

echo "Backup $STAMP complete in $OUT."
