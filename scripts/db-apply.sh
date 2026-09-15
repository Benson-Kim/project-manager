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

# -I: SET QUOTED_IDENTIFIER ON — required for filtered indexes (both creating
# them and any DML on tables that carry them). sqlcmd defaults it OFF.
SQLCMD="sqlcmd -S tcp:${DB_SERVER},${DB_PORT} -U ${DB_USER} -P ${DB_PASSWORD} -C -b -I"

# --- auth seed hashes (module #4) --------------------------------------------
# The admin/e2e seeds need argon2id hashes computed at seed time — no plaintext
# or hash is ever committed. Provide SEED_ADMIN_PASSWORD (hashed here via
# scripts/hash-password.mjs, requires node + the argon2 package) or a
# precomputed SEED_ADMIN_PASSWORD_HASH. Without either, the admin seed is
# skipped with a warning ('__SKIP__' sentinel in db/seed/027). E2E users
# (seed 028) are only inserted when E2E_SEED=1 and E2E_USER_PASSWORD is set.
hash_env() { # $1 = env var name holding a plaintext password; prints the hash
  node scripts/hash-password.mjs "$1"
}

SEED_ADMIN_PASSWORD_HASH="${SEED_ADMIN_PASSWORD_HASH:-}"
if [ -z "$SEED_ADMIN_PASSWORD_HASH" ] && [ -n "${SEED_ADMIN_PASSWORD:-}" ]; then
  SEED_ADMIN_PASSWORD_HASH="$(hash_env SEED_ADMIN_PASSWORD)"
fi
[ -n "$SEED_ADMIN_PASSWORD_HASH" ] || SEED_ADMIN_PASSWORD_HASH="__SKIP__"

E2E_SEED="${E2E_SEED:-0}"
E2E_USER_PASSWORD_HASH="__SKIP__"
if [ "$E2E_SEED" = "1" ] && [ -n "${E2E_USER_PASSWORD:-}" ]; then
  E2E_USER_PASSWORD_HASH="$(hash_env E2E_USER_PASSWORD)"
fi

run() {
  echo ">> $1"
  $SQLCMD -i "$1" \
    -v SEED_ADMIN_PASSWORD_HASH="$SEED_ADMIN_PASSWORD_HASH" \
    -v E2E_SEED="$E2E_SEED" \
    -v E2E_USER_PASSWORD_HASH="$E2E_USER_PASSWORD_HASH"
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
