#!/bin/sh
# Apply migrations, stored procedures and seeds to SQL Server, then the app's
# runtime login (db/security/app-login.sql, ADR-0033).
# Usage: db-apply.sh [--login-only]   (--login-only: just the login, e.g. after
# restoring the database onto another server, where its user is orphaned)
# Migrations are tracked in app.SchemaMigrations and applied exactly once;
# procs (CREATE OR ALTER) and seeds (MERGE/idempotent) are always re-applied.
# Requires sqlcmd and env: DB_SERVER (default localhost), DB_ADMIN_USER (default sa),
# DB_ADMIN_PASSWORD (default MSSQL_SA_PASSWORD), and for the runtime login
# DB_APP_USER (default pm_web) + DB_APP_PASSWORD. DB_USER / DB_PASSWORD are the
# app's own login and are never read here, so sourcing .env cannot swap them.
set -eu

case "${1:-}" in
  "") LOGIN_ONLY=0 ;;
  --login-only) LOGIN_ONLY=1 ;;
  *) echo "usage: db-apply.sh [--login-only]" >&2; exit 2 ;;
esac

DB_SERVER="${DB_SERVER:-localhost}"
DB_PORT="${DB_PORT:-1433}"
DB_ADMIN_USER="${DB_ADMIN_USER:-sa}"
DB_ADMIN_PASSWORD="${DB_ADMIN_PASSWORD:-${MSSQL_SA_PASSWORD:-}}"
DB_NAME="${DB_NAME:-ProjectManager}"
: "${DB_ADMIN_PASSWORD:?DB_ADMIN_PASSWORD (or MSSQL_SA_PASSWORD) is required}"

# -I: SET QUOTED_IDENTIFIER ON — required for filtered indexes (both creating
# them and any DML on tables that carry them). sqlcmd defaults it OFF.
SQLCMD="sqlcmd -S tcp:${DB_SERVER},${DB_PORT} -U ${DB_ADMIN_USER} -P ${DB_ADMIN_PASSWORD} -C -b -I"

# --- runtime login (ADR-0033) ------------------------------------------------
# Checked before anything is applied so a bad value fails fast.
DB_APP_USER="${DB_APP_USER:-pm_web}"
APP_LOGIN="__SKIP__"
APP_PASSWORD_SQL="__SKIP__"
if [ -n "${DB_APP_PASSWORD:-}" ]; then
  case "$DB_APP_USER" in
    "" | *[!A-Za-z0-9_]*) echo "ERROR: DB_APP_USER must be letters, digits or _" >&2; exit 1 ;;
  esac
  if [ "$DB_APP_USER" = "sa" ] || [ "$DB_APP_USER" = "$DB_ADMIN_USER" ]; then
    echo "ERROR: DB_APP_USER must not be the admin login" >&2; exit 1
  fi
  NL='
'
  case "$DB_APP_PASSWORD" in
    *"$NL"*) echo "ERROR: DB_APP_PASSWORD must be one line" >&2; exit 1 ;;
  esac
  APP_LOGIN="$DB_APP_USER"
  # sqlcmd pastes the value into N'…': double its single quotes.
  APP_PASSWORD_SQL="$(printf '%s' "$DB_APP_PASSWORD" | sed "s/'/''/g")"
elif [ "$LOGIN_ONLY" = 1 ]; then
  echo "ERROR: --login-only needs DB_APP_PASSWORD" >&2; exit 1
fi

app_login() {
  # The password travels only to this one sqlcmd, as an environment variable.
  echo ">> db/security/app-login.sql"
  DB_APP_USER="$APP_LOGIN" DB_APP_PASSWORD_SQL="$APP_PASSWORD_SQL" $SQLCMD -i db/security/app-login.sql
}

if [ "$LOGIN_ONLY" = 1 ]; then
  app_login
  echo "App login apply complete."
  exit 0
fi

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
  # The hashes travel as environment variables, NOT -v arguments: sqlcmd
  # resolves $(VAR) from the environment when no -v override exists, and its
  # -v argument parsing mangles values containing commas — argon2 encoded
  # hashes always contain "m=19456,t=2,p=1" (e2e job 16520676400: seeded
  # users could never log in).
  SEED_ADMIN_PASSWORD_HASH="$SEED_ADMIN_PASSWORD_HASH" \
  E2E_SEED="$E2E_SEED" \
  E2E_USER_PASSWORD_HASH="$E2E_USER_PASSWORD_HASH" \
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

# Functions before procedures, across every folder. An inline table-valued function is bound when
# it is created, so one that reads another must meet it already there; a procedure's references are
# resolved when it runs, so this order is enough for both. Folder-then-file order alone put
# ufn_Requirement_AncestorPath after key-deliverable/, whose Gantt proc reads it.
find db/procs -name 'ufn_*.sql' | sort | while read -r f; do run "$f"; done
find db/procs -name 'usp_*.sql' | sort | while read -r f; do run "$f"; done
for f in db/seed/*.sql; do run "$f"; done

app_login

echo "Database apply complete."
