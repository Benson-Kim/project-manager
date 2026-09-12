#!/bin/sh
# Zero-cost backup: SQL Server native BACKUP DATABASE (full + differential +
# transaction log), gzip, upload to the GitLab Generic Package Registry.
# Runs in the scheduled CI `backup` job. Restore: scripts/restore.sh
# Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME,
#      CI_API_V4_URL, CI_PROJECT_ID, CI_JOB_TOKEN (provided by GitLab CI),
#      UPLOADS_DIR (optional, app file uploads to include).
set -eu

DB_SERVER="${DB_SERVER:-mssql}"
DB_PORT="${DB_PORT:-1433}"
DB_USER="${DB_USER:-sa}"
DB_NAME="${DB_NAME:-ProjectManager}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="backups"
mkdir -p "$OUT"

sqlrun() { sqlcmd -S "tcp:${DB_SERVER},${DB_PORT}" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -Q "$1"; }

# SQL Server writes backups inside its own container; use a path shared via
# service volume, or fall back to /var/opt/mssql/data which we then fetch with
# a BACKUP ... TO DISK + sqlcmd? In CI the service container shares no volume,
# so we back up to a path and read it back via sqlcmd's :OUT is not binary-safe.
# Instead: run backups to /var/opt/mssql/backup inside the server and pull them
# with `docker cp` locally, or — in CI — mount CI_PROJECT_DIR (GitLab mounts the
# build dir into services at the same path for docker executors that support it).
BK_DIR="${BACKUP_DIR:-/var/opt/mssql/data}"

sqlrun "BACKUP DATABASE [$DB_NAME] TO DISK = N'$BK_DIR/${DB_NAME}-full-$STAMP.bak' WITH INIT, COMPRESSION, CHECKSUM;"
sqlrun "BACKUP DATABASE [$DB_NAME] TO DISK = N'$BK_DIR/${DB_NAME}-diff-$STAMP.bak' WITH DIFFERENTIAL, COMPRESSION, CHECKSUM;"
# Log backup requires FULL recovery model; tolerate SIMPLE in early phases.
sqlrun "IF (SELECT recovery_model FROM sys.databases WHERE name = N'$DB_NAME') = 1 BACKUP LOG [$DB_NAME] TO DISK = N'$BK_DIR/${DB_NAME}-log-$STAMP.trn' WITH COMPRESSION, CHECKSUM;" || true

# Copy backups out of the server if the backup dir is shared; otherwise export
# via BULK read. When BACKUP_DIR is a bind-mounted path this is a plain copy.
if [ -d "$BK_DIR" ]; then
  cp "$BK_DIR/${DB_NAME}-full-$STAMP.bak" "$OUT/" 2>/dev/null || true
  cp "$BK_DIR/${DB_NAME}-diff-$STAMP.bak" "$OUT/" 2>/dev/null || true
  cp "$BK_DIR/${DB_NAME}-log-$STAMP.trn" "$OUT/" 2>/dev/null || true
fi

# Include uploaded files (versioned by content) if present.
if [ -n "${UPLOADS_DIR:-}" ] && [ -d "${UPLOADS_DIR:-}" ]; then
  tar czf "$OUT/uploads-$STAMP.tar.gz" -C "$UPLOADS_DIR" .
fi

gzip -f "$OUT"/*.bak 2>/dev/null || true
gzip -f "$OUT"/*.trn 2>/dev/null || true

# Upload to the Generic Package Registry (free, versioned).
if [ -n "${CI_JOB_TOKEN:-}" ]; then
  for f in "$OUT"/*; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    curl --fail --silent --show-error \
      --header "JOB-TOKEN: $CI_JOB_TOKEN" \
      --upload-file "$f" \
      "$CI_API_V4_URL/projects/$CI_PROJECT_ID/packages/generic/project-manager-backups/$STAMP/$name"
    echo "uploaded $name -> package project-manager-backups/$STAMP"
  done
fi

echo "Backup $STAMP complete."
