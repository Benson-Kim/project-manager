#!/bin/sh
# Restore uploaded files from a backup package version created by scripts/backup.sh.
# Usage: scripts/restore-files.sh <version-stamp> [target-dir]
set -eu

VERSION="${1:?usage: restore-files.sh <version-stamp> [target-dir]}"
TARGET="${2:-uploads}"
API="${CI_API_V4_URL:-https://gitlab.com/api/v4}"
: "${CI_PROJECT_ID:?CI_PROJECT_ID is required}"

AUTH_HEADER="JOB-TOKEN: ${CI_JOB_TOKEN:-}"
[ -n "${GITLAB_TOKEN:-}" ] && AUTH_HEADER="PRIVATE-TOKEN: $GITLAB_TOKEN"

mkdir -p "$TARGET"
curl --fail -s --header "$AUTH_HEADER" -o "uploads-$VERSION.tar.gz" \
  "$API/projects/$CI_PROJECT_ID/packages/generic/project-manager-backups/$VERSION/uploads-$VERSION.tar.gz"
tar xzf "uploads-$VERSION.tar.gz" -C "$TARGET"
rm -f "uploads-$VERSION.tar.gz"

echo "Files restored to $TARGET from version $VERSION."
