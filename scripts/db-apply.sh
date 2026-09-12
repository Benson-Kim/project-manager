#!/bin/sh
# Apply migrations, stored procedures and seeds to SQL Server.
# Requires sqlcmd and env: DB_SERVER (default localhost), DB_USER (sa), DB_PASSWORD.
set -eu

DB_SERVER="${DB_SERVER:-localhost}"
DB_PORT="${DB_PORT:-1433}"
DB_USER="${DB_USER:-sa}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"

run() {
  echo ">> $1"
  sqlcmd -S "tcp:${DB_SERVER},${DB_PORT}" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -i "$1"
}

for f in db/migrations/*.sql; do run "$f"; done
find db/procs -name '*.sql' | sort | while read -r f; do run "$f"; done
for f in db/seed/*.sql; do run "$f"; done

echo "Database apply complete."
