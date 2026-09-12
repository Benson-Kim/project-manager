#!/bin/sh
# Apply migrations, stored procedures and seeds to SQL Server.
# Migrations are tracked in app.SchemaMigrations and applied exactly once;
# procs (CREATE OR ALTER) and seeds (MERGE/idempotent) are always re-applied.
# Requires sqlcmd and env: DB_SERVER (default localhost), DB_USER (sa), DB_PASSWORD.
set -eu

DB_SERVER="${DB_SERVER:-localhost}"
DB_PORT="${DB_PORT:-1433}"
DB_USER="${DB_USER:-sa}"
DB_NAME="${DB_NAME:-ProjectManager}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"

SQLCMD="sqlcmd -S tcp:${DB_SERVER},${DB_PORT} -U ${DB_USER} -P ${DB_PASSWORD} -C -b"

run() {
  echo ">> $1"
  $SQLCMD -i "$1"
}

applied() { # $1 = migration file basename; prints 1 if already applied
  $SQLCMD -h -1 -W -Q "SET NOCOUNT ON; IF DB_ID(N'$DB_NAME') IS NOT NULL AND OBJECT_ID(N'$DB_NAME.app.SchemaMigrations') IS NOT NULL SELECT COUNT(*) FROM [$DB_NAME].app.SchemaMigrations WHERE MigrationId = N'$1' ELSE SELECT 0;" | tr -d '[:space:]'
}

record() {
  $SQLCMD -Q "INSERT INTO [$DB_NAME].app.SchemaMigrations (MigrationId) VALUES (N'$1');"
}

for f in db/migrations/*.sql; do
  base="$(basename "$f")"
  if [ "$(applied "$base")" = "1" ]; then
    echo "== skip (already applied): $base"
  else
    run "$f"
    record "$base"
  fi
done

find db/procs -name '*.sql' | sort | while read -r f; do run "$f"; done
for f in db/seed/*.sql; do run "$f"; done

echo "Database apply complete."
