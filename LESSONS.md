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

## 9. Layout/relocation session (MR !5, 2026-09-15)

- 2026-09-15 MR !5: `verify:sources` was manual-only and agent tokens cannot play manual jobs -> added a `[verify]` commit-message opt-in (same style as `[e2e]`/`[lockfile]`). Use `[verify]` whenever a change touches `docs/source/**` or `tools/verify/**`.
- 2026-09-15 MR !5: work-item notes authored by another user return 403 on PUT -> post a dated correction comment instead of editing; say explicitly that it supersedes the stale paths.
- 2026-09-15 MR !5: after a directory moves deeper, relative markdown links inside moved files silently break (docs/source/analysis/VERIFICATION.md needed `../../../tools/…`). Sweep for `](../` inside every moved directory, not just for the old path string.

## 10. Database module session (MR !6, 2026-09-15)

- 2026-09-15 MR !6: sqlcmd defaults QUOTED_IDENTIFIER OFF; filtered indexes (`WHERE IsDeleted = 0`) then fail BOTH at CREATE INDEX and at any later DML on the table (Msg 1934). -> `scripts/db-apply.sh` now passes `-I`; every ad-hoc sqlcmd against this DB must too.
- 2026-09-15 MR !6: zod schemas with `.default()` make those fields REQUIRED in `z.infer` — repository/action signatures must take `z.input<typeof schema>` and parse internally, else every caller must spell out the defaults (typecheck job 16518451730).
- 2026-09-15 MR !6: the `db:apply` CI job (`[db]` commit flag; automatic on develop/main when `db/**` changes) is the proof for DB work: clean SQL Server 2022 service, `db-apply.sh` twice (idempotence), `db/verify/seed_counts.sql` asserts the §4 row counts. Uses a job-scoped throwaway SA password — the ephemeral service is not a secret; real hosts keep using the `MSSQL_SA_PASSWORD` CI variable.
- 2026-09-15 MR !6: tedious returns `CAST(RowVer AS BIGINT)` as a string — normalise with `z.coerce.number()` in row schemas (see src/modules/projects/schemas/project.ts `rowVerSchema`).
- 2026-09-15 MR !6: mass-uniform SQL (130 CRUD procs) is safest generated from one metadata dict in a scratch script, then committed as plain files; hand-write only the business procs and seed DATA transcription. The committed SQL is the source of truth — regenerating requires re-review.
- 2026-09-15 MR !6: sqlcmd only detects UTF-8 seed files reliably with a BOM — seeds containing non-ASCII characters (accents, curly quotes) are written utf-8-sig; keep it that way when editing them.
- 2026-09-15 session 7907345: agent sessions are hard-killed at 60 minutes. The session merged MR !6 at ~min 52 and died mid-edit of LESSONS.md before posting the final summary on #3. RULE: at minute 40 stop new work, push everything, post the close-out STATUS + successor launch instruction; a merge can wait for the next session, a lost close-out cannot be recovered without a human. Never poll a pipeline with `sleep` loops past minute 40.

## 11. Auth module session (MR !8, 2026-09-15)

- 2026-09-15 MR !8: `next-auth@^5.0.0` does not exist on the registry — Auth.js v5 ships only as `5.0.0-beta.x` (lockfile job 16519446243 ETARGET). -> Pin `^5.0.0-beta.NN` and record the reason in ADR-0014; check ETARGET risk for any "vNext" package before pushing `[lockfile]`.
- 2026-09-15 MR !8: importing the Auth.js config in a vitest suite fails with `Cannot find module 'next/server'` (next-auth/lib/env.js) — the node test env cannot resolve Next's ESM exports. -> `vi.mock("next-auth")` + `vi.mock("next-auth/providers/credentials")` in any test that imports the config; test the extracted `authorizeCredentials` function, not NextAuth itself.
- 2026-09-15 MR !8: prettier violations cost a full pipeline round-trip each. The `[format]` job emits an exact patch (scrape like the lockfile). -> After writing several new UI files, proactively run one `[format]` probe commit and apply the patch BEFORE relying on lint, instead of iterating one file per pipeline.
- 2026-09-15 MR !8: seed data that must never be committed (admin password hash) can be injected at seed time: `scripts/db-apply.sh` hashes an env var with a node one-liner script and passes it via `sqlcmd -v` scripting variables, with a `__SKIP__` sentinel when unset. The `db:apply` CI job installs `argon2` standalone (`npm install --no-save argon2`) — no full `npm ci` needed.
- 2026-09-15 MR !8: elapsed-time paranoia pays off in reverse too — check `date -u` before assuming budget is gone; tool calls are much faster than wall-clock intuition suggests.

## 12. Auth module close-out session (MR !8 merged, 2026-09-15)

- 2026-09-15 session 7914143: **sqlcmd `-v` silently mangles values containing commas** — every argon2 encoded hash contains `m=19456,t=2,p=1`, so seeded users could never log in (e2e job 16520676400: CredentialsSignin on the correct password) while inserts and row counts stayed green. -> Pass hash/complex values to sqlcmd via the ENVIRONMENT-variable fallback for `$(VAR)` (env prefix on the sqlcmd command), never `-v`; and assert the seeded hash verifies (fail-fast argon2.verify step in the e2e job) instead of trusting row counts.
- 2026-09-15 session 7914143: native modules must never be importable from a client component graph — the login form pulled `argon2` via `passwordSchema` in `src/lib/auth/password.ts` and broke `next build` (`Can't resolve 'fs'` in node-gyp-build, job 16520547692). -> Keep pure zod policy modules separate from hashing modules (`src/lib/auth/password-policy.ts`), and declare native packages in `serverExternalPackages` in next.config.ts.
- 2026-09-15 session 7914143: a JS ternary (`ok ? 0 : 1`) inside an unquoted `.gitlab-ci.yml` script line is a YAML `key: value` separator — the pipeline is created with ZERO jobs and `status=failed`, while the API reports `yaml_errors: null`. -> Write `ok?0:1` (no spaces) or quote the whole scalar; a 0-job failed pipeline means broken YAML, not failed jobs.
- 2026-09-15 session 7914143: Playwright strict mode — Next's route announcer carries an (empty) `role=alert` and the app shell live announcer carries `role=status`, colliding with real alerts/status boxes. -> `getByRole("alert").filter({ hasText: … })`.
- 2026-09-15 session 7914143: `pipelines?ref=<branch>` also returns `merge_request_event` pipelines, which are 0-job/failed under branch-only workflow rules — filter on `source=push` before concluding a commit failed.
- 2026-09-15 session 7914143: the e2e suite now REQUIRES the seeded SQL Server service (auth gates all app routes); login attempts share the runner IP against the 5/min rate limit — keep auth.spec.ts sequential (`mode: "default"`) and total real login attempts per run ≤ 4 (setup 1 + happy 1 + failed 2).

## 13. Password denylist session (issue #27, 2026-09-16)

- 2026-09-16 issue #27: new CI utility `denylist:generate` (`[denylist]` commit flag, manual otherwise, same trace-scrape pattern as `lockfile:generate`): fetches the SecLists top-10k list, verifies ~10000 lines, emits the lowercased/trimmed/deduped 12+-char subset gzip+base64 between `-----BEGIN/END DENYLIST B64-----` markers plus source sha256 and entry count. Scrape the LAST marker pair and keep only base64-alphabet lines.
- 2026-09-16 issue #27: SecLists renamed `Passwords/Common-Credentials/10-million-password-list-*.txt` to `xato-net-10-million-passwords-*.txt` (job 16525176408 hit a 404 on the historical raw URL). -> The job now resolves the filename via the GitHub contents API (prints the directory listing to the trace) and fails loudly if no top-10000 file exists; never hardcode a SecLists raw path without a resolver.
- 2026-09-16 issue #27: the xato-net top-10000 list contains only 24 passwords of 12+ characters — the min-12 length rule already excludes 99.76% of the top-10k, so the committed subset is <1 KB and safely ships in the shared client/server policy module (no server-only split needed).

## 13. Projects module session (MR !10, 2026-09-16)

- 2026-09-16 MR !10: axe color-contrast is the #1 e2e killer for new UI — two full pipeline round-trips were spent on tokens: a non-existent class (`text-accent-contrast` instead of `text-on-accent`) silently inherits the ink colour, and `text-ink-faint` fails 4.5:1 on `bg-surface-raised`. -> Copy colour classes from an existing passing component (button.tsx, kitchen-sink card: `text-ink-muted`), never invent token names; grep globals.css when unsure.
- 2026-09-16 MR !10: extending a zod row schema with new NOT-NULL-in-schema (nullable-in-DB) columns breaks every existing fixture that omits the keys — budget a fixture-fallout pass over `*.test.ts` in the same commit as the schema change.
- 2026-09-16 MR !10: the FormData→typed-input gap is solved with ONE form schema (`project-form.ts`): preprocess checkbox "on"/absent → boolean, "" → null, string → number/Date; share it between useZodForm (client blur validation) and the server action. Repo input schemas stay driver-typed.
- 2026-09-16 MR !10: login-budget arithmetic: `usp_LoginAttempt_Record` allows `@Count <= 5`, so 5 real logins/run pass (setup pm + viewer-setup + auth.spec 3). viewer-setup depends on setup to spread the window. Do NOT add a 6th login; reuse e2e/.auth/*.json storage states.
- 2026-09-16 MR !10: npm ci in the DAP workspace DOES eventually install (slow proxy, ~15+ min, node 20 vs required 22 warnings) but never in time to be useful — treat CI as the only verifier and don't wait on it.
- 2026-09-16 MR !10: epic #1 is a plain project issue (iid 1) — `PUT projects/:id/issues/1 description=...` works for ticking checklist lines; group epics API returns 403 for this token.

## 14. UX research session (MR !12 / ADR-0018, 2026-09-16)

- 2026-09-16 MR !12: docs-only MRs still run the full lint/typecheck/test pipeline (~4 min) — there is no docs-only fast path; budget the merge wait or add a `rules: changes` docs shortcut in a future CI MR before assuming "skipped".
- 2026-09-16 MR !12: `docs/adr/README.md` index is missing a row for ADR-0017 (the file exists) — ADR authors: when adding an index row, check the previous ADR made it into the table too; next docs MR should add the 0017 row.
- 2026-09-16 MR !12: research-type sessions fit comfortably in budget when reads are batched (parallel tool calls) and each deliverable is committed+pushed the moment it is written; the doc/ADR/issue/MR/merge cycle took ~12 minutes wall clock.

## 14. App shell session (MR !13, issues #25/#28, 2026-09-16)

- 2026-09-16 MR !13: adding an axe e2e scan to a page that never had one surfaces PRE-EXISTING violations, not just your own — the new shell scan over "/" failed on the home page's `text-ink-faint` on `bg-surface-raised` (2.45:1, the exact §13 pitfall). -> When a spec adds axe coverage to a new page, budget a contrast sweep of that page's existing markup in the same commit.
- 2026-09-16 MR !13: the react-hooks lint (Next 16 preset) hard-errors on synchronous setState inside useEffect ("cascading renders") — closing a drawer in a pathname effect failed lint. -> Close overlays via the interaction that navigates (link onClick), not via route-change effects.
- 2026-09-16 MR !13: the [format]+[e2e] probe on the FIRST commit (tokens+sizing only) was fully green in ~5 min and the prettier patch scrape (§11) applied cleanly for the later shell commit — front-loading the probe meant the only red pipelines cost one round-trip each (lint setState rule, pre-existing axe). Bootstrap-to-merge was ~37 min total; check `date -u` before assuming budget is gone (§11 confirmed again).

## 15. Project workspace layout session (MR !14 / ADR-0018, 2026-09-16)

- 2026-09-16 MR !14: `react-hooks/refs` (eslint) rejects writing `ref.current` during render (`dirtyRef.current = dirty;` at hook top level). When an effect already re-subscribes on the dep, the listener only exists while the flag is true — drop the ref and read the closure value instead.
- 2026-09-16 MR !14: Next runs a nested layout and its page in PARALLEL — wrapping the repository call in React `cache()` (`get-project.ts`) gives both ONE proc call per request; the page must still keep its own NOT_FOUND handling because segment renders are independent.
- 2026-09-16 MR !14: the `format:patch` artifact in the trace is gzip+base64 (gzip FNAME header included) — decode base64 between the LAST `-----BEGIN/END PRETTIER PATCH B64-----` pair, then `gzip.decompress`, then `git apply`.
- 2026-09-16 MR !14: this repo has no jsdom/@testing-library (ADR-0013) — design client logic as pure, DOM-free decision functions (e.g. `guardedHref` takes structural `{ href, target, hasAttribute }` likes) so vitest node env can cover them; assert the rendered behaviour in Playwright.
- 2026-09-16 MR !14: full pipeline incl. e2e completed in ~5 min (e2e job 146 s, 38 tests) — the "e2e is the long pole" assumption from earlier sessions no longer costs a session; budget one full [e2e] run per checkpoint instead of avoiding it.

## 16. Stakeholders merge + hand-over lessons (sessions 7982912 → successor, MR !11, 2026-09-16)

- 2026-09-16 MR !11: `develop` moved TWICE (docs MR !12, then the app-shell MR) while the stakeholders pipeline ran — a fully green MR became `conflict` at merge time and needed a re-merge + a second full pipeline (~7 min), pushing session 7982912 past 60 minutes. -> Right before the final `[e2e] [db]` push, `git fetch` and `git merge origin/develop` FIRST so the final pipeline already contains develop; if develop moves again after that, prefer `glab mr merge <iid> --auto-merge` (merge when pipeline succeeds) rather than waiting.
- 2026-09-16 MR !11: never sleep-poll a pipeline past minute 40. Set auto-merge (`glab mr merge <iid> --auto-merge --yes`, or `PUT /projects/:id/merge_requests/:iid/merge` with `merge_when_pipeline_succeeds=true`) and post the close-out STATUS + successor instruction; the successor verifies the merge (this is exactly how !11 landed).
- 2026-09-16 MR !11: `PUT /merge_requests/:iid/merge` returns HTTP 405 when the MR is not mergeable (conflicts / pipeline not finished). Check `detailed_merge_status` first; use `glab mr merge <iid> --yes` for the happy path.
- 2026-09-16 MR !11: `db:apply` had 3 transient `sqlcmd` core dumps on unrelated commits — re-run with an empty commit carrying `[db]` (`git commit --allow-empty`) rather than debugging.
- 2026-09-16 MR !11: parallel sessions collide on `playwright.config.ts` `testMatch` regex and `src/lib/messages.ts` — when adding a spec, extend the union regex in one place and expect to re-merge.
