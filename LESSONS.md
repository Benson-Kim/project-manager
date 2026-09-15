# LESSONS.md - operating lessons for agent sessions

This file is a living ledger of hard-won lessons. **Every session must read it before starting work and must append to it whenever it learns something that would have saved it time or prevented loss.** Keep entries short, dated, and actionable. Never delete a lesson; mark it superseded if it stops applying.

A briefing is a snapshot; the ledger is the truth.

---

## 1. Commit cadence (loss prevention)

Multiple predecessor sessions died with uncommitted or unpushed work and it was **lost**.

- Commit **and push** to the working branch every ~2-3 minutes of work or after every file edit, whichever comes first. Use `[skip ci]` in the message for these checkpoint commits.
- Never hold more than **one** edited file uncommitted.
- Squash or tidy history only at the MR level (squash on merge), never by rewriting pushed commits mid-session.

## 2. Push before long-running commands

- Never start a full test battery (`npm run test`, `npm run e2e`, Playwright suite), a full `npm run build`, a migration walk (`scripts/db-apply.sh`), a backup/restore rehearsal or a Docker build while **any** work sits unpushed. Push first.
- Run long jobs in the background with a log file and a pid file:
  `setsid nohup <command> > .agent-scratch/<name>.log 2>&1 & echo $! > .agent-scratch/<name>.pid`
- Iterate with targeted runs (`vitest run <file>` / `-t <name>`, `playwright test <file>`); run the full battery only at pushed checkpoints.

## 3. Resume protocol (takeover of a dead or paused session)

1. `git fetch --all --prune`, check out the **remote** branch (`git checkout -B <branch> origin/<branch>`) and inspect its head. Anything not on the remote is lost and must be redone; do not trust local state.
2. Post a dated **STATUS** note on the hand-off work item immediately after resume verification, then after **every** push and at **every** milestone. These notes are the only durable ledger of progress.
3. STATUS note format: `STATUS <ISO date-time> | branch <name> @ <short SHA> | done: ... | next: ... | blocked: ...`

## 4. Review before continuing

- A resumed session reviews the predecessor's pushed diff **in full** before writing any new feature code, across all seven review gate dimensions: correctness, security, data layer (procs/migrations), UX and accessibility, tests, performance, docs and conventions (if `docs/STANDARDS.md` defines the gates differently, STANDARDS.md wins).
- Findings go in a dated **REVIEW** note on the work item, classified **BLOCKING / MAJOR / MINOR**, each citing the SHA and file.
- BLOCKING findings are fixed before new work starts.

## 5. Test fallout is read, not assumed

- When a battery fails after a behaviour change, classify every failure: (a) fixture fallout that encoded the old behaviour (edit the fixture, record the rationale), (b) a test that encodes the old behaviour end-to-end (rewrite it to encode the new behaviour, keeping its original assertions where still valid), (c) a genuine regression (fix the code).
- A recorded failure that does not reproduce on a fresh database is re-verified in the full battery on a pushed checkpoint, never "fixed" blindly.
- Never commit files that test runs rewrite (generated snapshots, explain plans, coverage output). `git checkout -- <path>` them before committing, and keep them in `.gitignore` or `.git/info/exclude`.

## 6. Environment gotchas (Duo Agent Platform runners)

General (verified on this platform):
- `jq` is not installed. Use `python3 -c 'import json,sys; ...'` or `node -e`.
- The read-file tool refuses absolute paths outside the workspace and gitignored paths. Keep scratch files under a workspace directory (for example `.agent-scratch/`) listed in `.git/info/exclude`, and print them with `cat` / `sed -n`.
- The runner checks out the **default branch** (`main`), which lacks the application code. Check out the feature branch **first**, then bootstrap (`npm ci`, Docker services). Bootstrapping on `main` wastes time and produces misleading errors.
- Verify tool versions before relying on them (`node --version`, `npm --version`, `python3 --version`, `docker --version`); system Python may be old (3.9) while a newer interpreter exists at `/usr/bin/python3.12`.
- Sandbox restrictions: services may have to run TCP-only (unix sockets can be refused) and non-root services may need to be started as `nobody` because the runner is root. Local services are for iteration only; the CI service container (for this project: SQL Server 2022 in `.gitlab-ci.yml`) is the authority.

Carried over from a sibling Python/Postgres project (verify before assuming they apply here): pgserver wheel had to run as `nobody`, TCP-only, with `pgcrypto` stubbed; `backend/perf/explain_*.txt` were rewritten by test runs and had to be reverted before committing. The transferable lesson: know which files your test runs mutate, and know which local service quirks differ from CI.

## 7. How to add a lesson

Append under the matching section (or add a section) in the form:

`- <YYYY-MM-DD> <session id or MR>: <what happened> -> <rule going forward>`

---

## Ledger

- 2026-09-15 (foundation session brief): file created from predecessor post-mortems across sessions; rules 1-6 above are mandatory from now on.

## 7. GitLab token limits + CI workarounds (foundation session, 2026-09-15)

- The workspace token CANNOT: download job artifacts (403 insufficient_scope), play manual jobs, set pipeline variables on pipeline-create. It CAN read job traces.
- Therefore: `lockfile:generate` emits `package-lock.json` base64-gzipped into the job trace between `-----BEGIN/END LOCKFILE B64-----` markers — scrape the trace, decode, commit. Match marker lines exactly (each marker appears twice: command echo + output).
- CI opt-ins are commit-message flags (no privileges needed): `[e2e]` runs Playwright on a feature branch, `[lockfile]` refreshes the lockfile. After editing package.json, push `[lockfile]`, scrape, commit the new lockfile with `[e2e]`.
- Prettier gates code only; `*.md`/`docs/` are exempt (.prettierignore) — markdown cannot be formatted locally (npm blocked).
- `git checkout -- .` and `git branch -f` are destructive with uncommitted/unmerged work: commit on the right branch FIRST (this session lost and had to redo edits both ways).
- `git add -A` fails on the runner's device files (~/.bashrc etc. appear as char devices in the repo root); `git stash` fails the same way. Stage explicit paths only, and verify with `git status --short` + `git show --stat` that the commit actually captured the files.

## 8. Verification claims and toolchain compatibility (session 7841296, 2026-09-15)

- 2026-09-15 session 7841296: ADR-0014 recorded "eslint ^10 verified green in CI" but the only pipeline after the unpin died at `npm ci` before lint ever ran; eslint 10 then crashed `eslint-plugin-react` (via eslint-config-next) with `getFilename is not a function`. -> Never write "verified" in an ADR/MR/comment unless you watched the exact job succeed on the exact commit; cite the pipeline/job id next to the claim.
- 2026-09-15 session 7841296: major-version bumps of toolchain packages (eslint, typescript) are gated by their slowest plugin, not by the package's own peer ranges — `eslint-config-next` bundles `eslint-plugin-react`/`eslint-plugin-jsx-a11y` whose support lags. -> Before a toolchain major bump, check the bundled plugins' peer ranges in the `lockfile:generate` trace (`npm info <pkg> peerDependencies`), and let Renovate propose it with a green pipeline instead of hand-bumping.
- 2026-09-15 session 7841296: the trace-scrape of `package-lock.json` (§7) works verbatim; strip the runner's `<timestamp> 01O ` line prefix and keep only base64-alphabet lines between the LAST marker pair (the command echo lines also end with the marker text). Validate the decoded lockfile against package.json (all deps present, ranges match) before committing.
- 2026-09-15 session 7841296: file-editing tools refuse `.gitlab/duo/**` (Duo context exclusion). Edit those files via shell (`python3`/`sed`) — they are not secrets, just excluded from AI context.
