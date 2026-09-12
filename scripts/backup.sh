#!/bin/sh
# Zero-cost backup: SQL Server native BACKUP DATABASE (full + differential +
# transaction log), pulled back over the SQL connection, gzipped and uploaded
# to the GitLab Generic Package Registry. Runs in the scheduled CI `backup`
# job (SCHEDULE_JOB=backup). Restore: scripts/restore.sh / restore-rehearsal.sh.
#
# The backup files are written on the SQL Server host (BK_DIR). Because a CI
# job container has no filesystem access to the server, each file is pulled
# back via OPENROWSET(BULK ..., SINGLE_BLOB) as hex and decoded locally —
# binary-safe and needs nothing but sqlcmd + xxd.
#
# Env: DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME,
#      CI_API_V4_URL, CI_PROJECT_ID, CI_JOB_TOKEN (provided by GitLab CI),
#      UPLOADS_DIR (optional app uploads dir), BACKUP_RETAIN_DAYS (default 30,
#      pruning needs GITLAB_TOKEN with api scope; skipped otherwise).
set -eu

DB_SERVER="${DB_SERVER:-mssql}"
DB_PORT="${DB_PORT:-1433}"
DB_USER="${DB_USER:-sa}"
DB_NAME="${DB_NAME:-ProjectManager}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="backups"
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

gzip -f "$OUT"/*.bak "$OUT"/*.trn

# Upload to the Generic Package Registry (free, versioned by timestamp).
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

# Retention: delete package versions older than BACKUP_RETAIN_DAYS.
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"
if [ -n "${GITLAB_TOKEN:-}" ]; then
  CUTOFF="$(date -u -d "-${RETAIN_DAYS} days" +%Y%m%d 2>/dev/null || date -u -v-"${RETAIN_DAYS}"d +%Y%m%d)"
  curl --silent --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
    "$CI_API_V4_URL/projects/$CI_PROJECT_ID/packages?package_name=project-manager-backups&per_page=100" \
  | tr ',' '\n' | grep -oE '"id":[0-9]+|"version":"[0-9]{8}-[0-9]{6}"' | paste - - | while read -r idkv verkv; do
      id="${idkv#\"id\":}"; ver="${verkv#\"version\":\"}"; ver="${ver%\"}"; day="${ver%%-*}"
      if [ "$day" -lt "$CUTOFF" ] 2>/dev/null; then
        curl --silent --request DELETE --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
          "$CI_API_V4_URL/projects/$CI_PROJECT_ID/packages/$id" && echo "pruned backup package $ver (id $id)"
      fi
    done
else
  echo "GITLAB_TOKEN not set — skipping retention pruning (retain ${RETAIN_DAYS}d)."
fi

echo "Backup $STAMP complete."
