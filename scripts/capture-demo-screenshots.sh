#!/usr/bin/env bash
# capture-demo-screenshots.sh
#
# Runs the Playwright demo screenshot suite and writes PNGs to screenshots/.
#
# Prerequisites
# ─────────────
# 1. SQL Server running and seeded:
#      bash scripts/db-apply.sh
#
# 2. The Next.js app compiled and serving at http://localhost:3000:
#      npm run build && npm run start
#    (or leave it running from a previous session; the script reuses it)
#
# 3. Credentials for a seeded admin/PM user:
#      DEMO_USERNAME=e2e-admin   (default: e2e-pm)
#      DEMO_PASSWORD=<password>  (required)
#    On a local machine you can set them inline:
#      DEMO_USERNAME=e2e-admin DEMO_PASSWORD=<pw> bash scripts/capture-demo-screenshots.sh
#
# 4. Playwright browsers installed:
#      npx playwright install chromium
#
# Output
# ──────
# screenshots/   (git-ignored)  — 20 PNG files named NN-description.png
#
# Each shot is 1280×900 desktop by default; mobile shots (390×844) are shots
# 05, 08, and include the word "mobile" in the filename.
#
# Usage
# ─────
#   bash scripts/capture-demo-screenshots.sh
#
#   # Custom base URL (e.g. staging):
#   BASE_URL=https://staging.example.com bash scripts/capture-demo-screenshots.sh
#
#   # Headed mode (watch the browser):
#   HEADED=1 bash scripts/capture-demo-screenshots.sh
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── env checks ───────────────────────────────────────────────────────────────

if [[ -z "${DEMO_PASSWORD:-}" ]]; then
  echo "ERROR: DEMO_PASSWORD is not set." >&2
  echo "  Export it before running:  export DEMO_PASSWORD=<password>" >&2
  exit 1
fi

export DEMO_USERNAME="${DEMO_USERNAME:-e2e-pm}"
export BASE_URL="${BASE_URL:-http://localhost:3000}"

# ── output directory ─────────────────────────────────────────────────────────

mkdir -p screenshots

# ── start the app server if not already running ──────────────────────────────
# playwright.config.ts sets reuseExistingServer: true locally, so Playwright
# will reuse any server already on BASE_URL.  We only launch one ourselves when
# nothing is listening yet; this avoids the EADDRINUSE crash.

APP_PID=""
if ! curl -sf --max-time 3 "${BASE_URL}" > /dev/null 2>&1; then
  echo "==> No server found at ${BASE_URL}. Building and starting the app…"
  npm run build
  npm run start &
  APP_PID=$!

  echo "==> Waiting for the server to be ready…"
  for i in $(seq 1 30); do
    if curl -sf --max-time 2 "${BASE_URL}" > /dev/null 2>&1; then
      echo "==> Server ready."
      break
    fi
    sleep 2
    if [[ $i -eq 30 ]]; then
      echo "ERROR: Server did not start within 60 s." >&2
      kill "${APP_PID}" 2>/dev/null || true
      exit 1
    fi
  done
else
  echo "==> Server already running at ${BASE_URL} — reusing it."
fi

# ── ensure auth storage state exists ─────────────────────────────────────────
# If pm.json is missing (first run), the setup project runs first automatically
# because the demo project declares it as a dependency in playwright.config.ts.

# ── run the suite ─────────────────────────────────────────────────────────────

# Kill the server we started (not a pre-existing one) when the script exits.
cleanup() {
  if [[ -n "${APP_PID}" ]]; then
    echo "==> Stopping app server (pid ${APP_PID})…"
    kill "${APP_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

HEADED_FLAG=""
if [[ "${HEADED:-0}" == "1" ]]; then
  HEADED_FLAG="--headed"
fi

echo "==> Capturing demo screenshots against ${BASE_URL}"
echo "    Output: $(pwd)/screenshots/"
echo ""

npx playwright test e2e/demo-screenshots.spec.ts \
  --config=playwright.config.ts \
  --project=demo-standalone \
  --workers=1 \
  ${HEADED_FLAG}

echo ""
echo "==> Done. Files written to screenshots/:"
ls -1 screenshots/*.png 2>/dev/null || echo "  (no PNG files found — check for test failures above)"
