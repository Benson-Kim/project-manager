#!/bin/sh
# Restore uploaded files from a backup set created by scripts/backup.sh (ADR-0032).
# Usage: scripts/restore-files.sh <version-stamp> [target-dir]
# Env: BACKUP_SOURCE_DIR (where the set is, default BACKUP_OUT_DIR or ./backups).
set -eu

VERSION="${1:?usage: restore-files.sh <version-stamp> [target-dir]}"
TARGET="${2:-uploads}"
SRC="${BACKUP_SOURCE_DIR:-${BACKUP_OUT_DIR:-backups}}"
ARCHIVE="$SRC/uploads-$VERSION.tar.gz"
[ -f "$ARCHIVE" ] || { echo "ERROR: $ARCHIVE not found"; exit 1; }

mkdir -p "$TARGET"
tar xzf "$ARCHIVE" -C "$TARGET"

echo "Files restored to $TARGET from version $VERSION."
