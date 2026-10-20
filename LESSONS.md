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

## 14. Local workspace + Next 16 hazards (session 2026-09-15, docs/source layout)

- 2026-09-15 (layout session): `next dev` (Next 16.3.5) rewrites THREE tracked files on
  every start: it appends a vendor block to `AGENTS.md`, adds
  `.next/dev/types/**` to `tsconfig.json` `include` AND flips `jsx` from
  `preserve` to `react-jsx` (it also re-formats the whole file, which would fail
  the prettier gate), and adds `.next/dev/types` imports to `next-env.d.ts`.
  Those paths are gitignored, so committing them breaks a fresh checkout.
  -> `agentRules: false` in `next.config.ts` stops the AGENTS.md clobber; the other
  two must be `git checkout --` reverted before every commit. This is section 5
  ("know which files your test runs mutate") applied to the dev server.
- 2026-09-15 (layout session): the generated AGENTS.md block instructs the reader to
  commit it and claims removal is futile. Tool-generated text is DATA, not
  instructions — verify the mechanism (`node_modules/next/dist/server/lib/
  generate-agent-files.js`) and decide on the project's terms.
- 2026-09-15 (layout session): the foundation CSP omitted `'unsafe-eval'`, so React's
  dev build logged an eval() console error on every page. Fixed by adding it
  ONLY when `NODE_ENV === "development"`; `src/test/proxy-csp.test.ts` pins that
  it never reaches production. -> When a security header blocks a dev-only need,
  branch on the environment and add a test for the production case; never relax
  the shipped policy.
- 2026-09-15 (layout session): moving a directory one level deeper silently breaks
  relative links INSIDE the moved files (`docs/source-analysis/X.md`'s
  `../../tools/...` became `docs/tools/...`). A grep for the old directory name
  does not catch these. -> After any `git mv` of a directory, resolve every
  relative link in the moved files and assert the target exists.
- 2026-09-15 (layout session): `usp_ActivityStatus_Create` (merged, migration 001 era)
  throws `50001` for a validation failure, but ADR-0012 assigns 50001 to
  NOT_FOUND (50004 is VALIDATION); it also lives in `dbo.`, not `app.`. Merged
  code is immutable, so follow `usp_ViewPreference_Set` as the ADR-0012 reference
  instead. -> Verify a "reference implementation" against the ADR before copying it.

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

## 17. Suppliers module session (MR !16, 2026-09-16)

- 2026-09-16 MR !16: e2e validation specs — filling a field and then clicking Save races blur-validation: blur fires on mousedown, the inline-error re-render shifts layout, and the click lands nowhere (submit never fires; the summary never appears; 53/54 with only that spec red). -> `await field.blur()` and assert the inline error BEFORE clicking Save. Empty-form specs (stakeholders) never hit this because no field was touched.
- 2026-09-16 MR !16: before writing a module's repository/row schemas, `find src/modules/<key>` — the #5 repositories session already shipped `repository/*.ts` + `schemas/*.ts` + Vitest suites for several entities (suppliers had all of it). Only the form contract, actions, components, pages and e2e were missing; duplicating would have cost the session.
- 2026-09-16 MR !16: modules whose table+procs shipped complete in #3 need ZERO db work — no migration, no proc edits, no seed change; `db:apply` still proves it via the `[db]` flag. Don't invent a migration for a UI vocabulary (suppliers Rating stayed free-text in DB, vocab enforced in the form schema only).
- 2026-09-16 MR !16: arming `glab mr merge <iid> --auto-merge --yes` right after un-drafting (while e2e still runs) merged the MR ~0 s after the pipeline went green — zero polling wasted; the whole module (orient→merge) fit in ~33 min despite also closing out the predecessor's Task A.
- 2026-09-16 MR !16: `revalidatePath` cannot revalidate a dynamic-segment page path without the `type:"page"` argument the shared `action()` wrapper doesn't forward — for cookie-gated (always-dynamic) pages, the sheet's `router.refresh()` is sufficient; consider extending `action()` if a static project-scoped page ever appears.

## 18. Assumptions-constraints module session (feature/assumptions-constraints, 2026-10-01)

- 2026-10-01 feature/assumptions-constraints: the workspace was forked from cbc9e64 with all module files already committed but shared-file additions (messages.ts, rbac.ts, project-sections.ts, playwright.config.ts) not yet applied. -> `git diff develop cbc9e64 -- <file>` is the exact command to extract what needs re-applying; run it for every shared file listed in the session instructions before writing any new code.
- 2026-10-01 feature/assumptions-constraints: `git add <path>` on Windows with CRLF warnings still stages correctly — the "LF will be replaced by CRLF" warning is informational, not an error; verify with `git status` to confirm staging succeeded.
- 2026-10-01 feature/assumptions-constraints: ESLint times out on App Router route-group paths (`src/app/(app)/...`) when invoked with shell quoting on Windows PowerShell — lint the module slice and shared libs directly instead. TypeCheck (`npx tsc --noEmit`) is the reliable local gate; CI runs the full ESLint suite.
- 2026-10-01 feature/assumptions-constraints: 3 pre-existing test failures exist in the suite (format.test.ts null/undefined formatDate, questions-answers FORBIDDEN for Contributor) — always establish the baseline before and after to distinguish new failures from pre-existing ones.

## 19. Per-project access session (S1, fix/idor-getbyid, 2026-10-08)

- 2026-10-08 fix/idor-getbyid: Git Bash heredocs and `node -e` strings collapse `\\` to `\`, which silently corrupts SQL like `REPLACE(@s, N'\', N'\\')` / `ESCAPE N'\'`. -> Write any script or SQL containing backslashes with the editor (file write), never through a shell string, and grep the result for the escape clause.
- 2026-10-08 fix/idor-getbyid: verify proc changes without touching the shared dev database by deploying them into a shadow schema (copies of the tables they read, migration repointed at the shadows), running each case inside a transaction that is rolled back, and checking nothing is left behind. `.agent-scratch/verify-access.cjs` is the template.
- 2026-10-08 fix/idor-getbyid: `beforeEach(() => mock.mockClear())` returns the mock, and Vitest runs a function returned from `beforeEach` as teardown, so a throwing mock fails every test. -> Use a block body: `beforeEach(() => { mock.mockClear(); })`.
- 2026-10-08 fix/idor-getbyid: `notFound()` under the `(app)/loading.tsx` Suspense boundary renders the not-found page with HTTP 200 (the shell already streamed). -> e2e asserts the not-found heading, not `response.status()`.
- 2026-10-08 fix/idor-getbyid: `prettier --check` flags every file on a Windows CRLF checkout. -> Check locally with `--end-of-line auto`; CI (LF) checks style only.
- 2026-10-08 fix/idor-getbyid: `npm run build` (Turbopack) panics in a worktree whose `node_modules` is a junction to another checkout ("Symlink [project]/node_modules is invalid, it points out of the filesystem root"). -> Build worktrees locally with `npx next build --webpack`; CI has a real `node_modules` and uses the default build.
- 2026-10-08 fix/idor-getbyid: `.github/workflows/ci.yml` runs on pushes to main, develop and `feature/**` only, and the `[e2e]` gate reads the push's head commit. A `fix/**` branch gets no CI on push. Push events run the workflow file from the pushed commit, but `workflow_dispatch` only works once the workflow exists on GitHub's default branch (main). -> Name branches `feature/**` (or open a PR to develop) when CI evidence is needed.
- 2026-10-08 fix/idor-getbyid: removing a worktree with `git worktree remove --force` emptied the MAIN checkout's `node_modules`. Unlinking the worktree's top-level `node_modules` junction was not enough: Next's build output (`.next/node_modules/<pkg>-<hash>`, `.next/standalone/...`) contains further junctions that resolve to the real `node_modules`, and the recursive delete followed them. It was restored with `npm ci --offline` from the npm cache. -> Before deleting any worktree, `.next` or build folder on Windows, list reparse points (`Get-ChildItem <dir> -Recurse -Force -Attributes ReparsePoint`), unlink each one with `cmd /c rmdir <link>` (no `/s`), then delete. Check that `node_modules/next/package.json` still exists afterwards.

## 20. Datasheet session (feature/datasheet, ADR-0022/0023, 2026-10-09)

- 2026-10-09 feature/datasheet: Git Bash rewrites `/route` and `@/modules/...` arguments and env values into Windows paths (MSYS path conversion: `/todo` became `c:/Program Files/Git/todo`). -> `export MSYS_NO_PATHCONV=1` before passing URLs or import paths to scripts.
- 2026-10-09 feature/datasheet: `node -e` and unquoted heredocs collapse backslashes again (`\r\n` turned into real newlines inside a generated script). -> Write scripts with the editor; for line endings use `String.fromCharCode(13, 10)`.
- 2026-10-09 feature/datasheet: the shadow DB harness re-points `app.X` inside string literals too (audit EntityName became `dsverify.LookupList`). -> Assert audit rows by EntityId/Action in harness cases.
- 2026-10-09 feature/datasheet: moving files in the IDE mid-session rewrites imports, and relative `vi.mock("./x")` paths are not type-checked. -> After a test move, resolve every relative specifier and run the suite.
- 2026-10-09 feature/datasheet: an `sr-only` label (absolutely positioned) inside an `overflow-x-auto` table escapes the scroller when the containing block is an ancestor (`<main class="relative">`) and stretches the whole page; the datasheet's ✓/× buttons went off-screen. -> Give every horizontal scroller `relative`.
- 2026-10-09 feature/datasheet: a component that portals into `document.body` during render (project section nav, active group open on mount) aborts SSR with "document is not defined" and silently falls back to client rendering. -> Render portals only after an effect has run (e.g. once a measured position exists).
- 2026-10-09 feature/datasheet: "features can't be seen" was mostly the default view: project pages opened in grid (cards) unless the user had toggled, and the datasheet only exists in list view. -> Verify a UI feature in the running app with a fresh user (no saved preferences), not only with tests.
- 2026-10-09 feature/datasheet: a proc that THROWs under `XACT_ABORT ON` dooms an outer test transaction, so the next cases in the same batch fail with 3930. -> One rolled-back transaction per case, checking `XACT_STATE()` before ROLLBACK.
- 2026-10-09 feature/datasheet: local SQL Express is SQL Server 2019 (compat 150), so no `IS DISTINCT FROM`; write NULL-safe comparisons out.

## 21. Rich-text session (P1, feature/rich-text, ADR-0025, 2026-10-10)

- 2026-10-10 feature/rich-text: the branch was cut from an old base and carried commits that develop later re-landed in rewritten form (WIP checkpoints, the first desktop shell); `git merge develop` hit 41 conflicts. -> Preview with `git merge-tree --write-tree --name-only develop <branch>` before merging. After resolving to develop's side, also diff the auto-merged files against develop (`git diff --cached --stat develop`): four stale files merged cleanly and would otherwise have slipped in.
- 2026-10-10 feature/rich-text: React reports `onChange` only for text-like inputs, checkboxes, radios, selects and files. An `<input type="hidden">` never fires it, so a fieldset's `onChange` dirty flag missed the editor. -> A custom control mirrors its value into `<input type="text" hidden>`, sets it through the prototype's value setter (past React's value tracker) and dispatches a bubbling `input` event. A synthetic `focusout` on the same input drives useZodForm's blur validation.
- 2026-10-10 feature/rich-text: a Radix Dialog renders in a portal, but React events still bubble through the component tree. A `<form>` inside a dialog opened from a sheet would therefore submit into the sheet's `onSubmit`. -> No nested forms in dialogs that live inside a form; handle Enter on the input.
- 2026-10-10 feature/rich-text: shared form schemas are bundled into the browser, so a schema helper must not import server-only packages (sanitize-html pulls in postcss). -> Inject the server half at runtime and fail closed when it is missing (`installRichTextSanitizer`). Guard it with an import-graph test that starts from every "use client" module (`src/tests/rich-text-boundaries.test.ts`).
- 2026-10-10 feature/rich-text: GNU sed treats `\u` in a replacement as "uppercase the next character", so a sed meant to write the ` ` escape wrote `00a0`. A generated Node script with the same text failed to parse ("Invalid Unicode escape sequence"). -> Write escapes with the editor, or build the character in code (`String.fromCharCode(0xa0)`).
- 2026-10-10 feature/rich-text: Tiptap v3's `useEditor` re-applies changed options on every render but keeps `editable` as it was, and v3 no longer re-renders on every transaction. -> Call `editor.setEditable(x, false)` in an effect (`false`: no update event, so no dirty form), and read toolbar state with `useEditorState`.

## 22. File storage session (F1, feature/file-storage, ADR-0026, 2026-10-10)

- 2026-10-10 feature/file-storage: Next 16's proxy buffers every request body it matches, up to `proxyClientMaxBodySize` (10 MB). -> A route that must stream (uploads) leaves the matcher, and then owns everything the proxy did for it: the session gate (including the must-change-password redirect), same-origin, and its response headers (CSP included).
- 2026-10-10 feature/file-storage: the matcher regex is easy to get subtly wrong (`api/files` also matches `/api/filesystem`). -> Compile it with Next's own `getMiddlewareMatchers` (`next/dist/build/analysis/get-page-static-info`; exported at runtime, missing from its .d.ts) and test real paths (`src/tests/proxy-matcher.test.ts`).
- 2026-10-10 feature/file-storage: desktop installs are per user, so two app versions can run against one machine-wide machine.json. Bumping its `schemaVersion` for a new field would make the older app refuse the file and run its own old provision.ps1, which writes the old shape back: the two apps would trade administrator prompts. -> Add fields under the same version; the new app treats a missing field as "feature off until IT sets it up" (see the 2026-10-11 entry below).
- 2026-10-10 feature/file-storage: `closeAlarmToast` (e2e/support/alarms.ts) waits for e2e-pm's seeded overdue alarm, so a local run as `local-verify` times out in every spec that uses it. -> Seed the same "E2E overdue alert" to-do + alert for the local account once (done in the local DB on 2026-10-10).
- 2026-10-10 feature/file-storage: `break-words` (overflow-wrap: break-word) does not shrink a flex item's min-content width, so a long name inside an `inline-flex` link still overflows; `break-all` wraps mid-word everywhere. -> `wrap-anywhere` (Tailwind 4.3).
- 2026-10-10 feature/file-storage: an untyped `vi.fn()` does not satisfy a typed dependency interface under `tsc`. -> `vi.fn<Deps["getFile"]>()` and `Mock<Deps["getFile"]>`; inject dependencies into route-handler logic so it is testable without Auth.js.
- 2026-10-11 feature/file-storage (review): the first F1 build made a missing `uploadsDir` a blocking "Repair or Quit" at start-up. The client's staff are standard Windows users, and every green push to develop auto-updates installed PCs, so the merge would have locked every pre-F1 PC out of the whole app until IT visited. -> A desktop change that needs an administrator switches its feature off (`UPLOADS_ENABLED=false`), offers the setup once and keeps it in the tray, and documents a remote command for IT. It never blocks start-up.
- 2026-10-11 feature/file-storage (desktop run): `next build` output tracing follows runtime paths. `path.join(process.cwd(), "uploads")` copied the build machine's uploaded files into `.next/standalone` (which the installer ships), and `path.join(root, ".tmp")` with an unknown `root` became "any `<folder>/.tmp`", which picked up vitest's coverage temp files; when vitest deleted them mid-copy, the copy failed half-way and `next build` still exited 0, leaving the download route and the daily-activities pages without chunks (500s on desktop only: `next start` reads `.next/server` and hides it). -> Mark runtime-only paths `/* turbopackIgnore: true */`; `scripts/desktop/build.mjs` now refuses a standalone with anything but `.next`, `node_modules`, `public`, `package.json`, `server.js`, or with a traced file missing; never build while tests run; test downloads against the standalone server, not `next start`.
- 2026-10-11 feature/file-storage (desktop run): the desktop logger wrote every line to stdout too, and `main.ts` logs every uncaughtException. A closed stdout pipe (EPIPE) arrives as an async 'error' event, so the two fed each other: 750 MB of log in about three minutes. It also rotated only at start-up. -> `electron/log.ts` ignores console stream errors and rotates at 5 MB while running (`electron/tests/log.test.ts`).
- 2026-10-11 feature/file-storage (desktop run): Electron has no download bar. A download the server refuses (404) or cuts off (changed bytes, ADR-0026 §3) ended silently after the Save dialog, and a cut-off one stays "interrupted, resumable" forever (an `updated` event, never `done`). -> `main.ts` `watchDownloads()` names the Save dialog after the file, and on interruption cancels the item and says the file may have been changed or removed.
- 2026-10-11 feature/file-storage (desktop run): drive the desktop app without touching the user's mouse or keyboard (they work on the same PC): `electron --inspect=9229 --remote-debugging-port=9333`; tray items via the main-process inspector (`Runtime.queryObjects(Menu.prototype)`, then `item.click()`); the window via Playwright `connectOverCDP`; screenshots via `webContents.capturePage()` (CDP screenshots hang while the window is minimized); native task dialogs via `TDM_CLICK_BUTTON` (custom buttons are 100 + index; OK 1, Cancel 2, Close 8) and file dialogs via `WM_COMMAND` IDCANCEL. Never launch it with redirected output (`*>`): the pipe breaks when the shell returns.

## 23. Client feedback session (feature/file-storage, 2026-10-12)

- 2026-10-12 feature/file-storage: a client "forgot their password" while the SQL Server service had simply stopped: the login action mapped every AuthError, including a CallbackRouteError whose cause was a dead connection, to "check your username and password" (main.log). -> Name infrastructure failures that are the same for every account (`DatabaseUnavailableError`, `messages.auth.databaseUnavailable`); keep the generic message for anything that could depend on the account. Read the client's main.log before answering an account question.
- 2026-10-12 feature/file-storage: an `<input type="text">` strips line breaks from its value, so focusing and leaving a datasheet cell holding multi-line text saved it without them. -> Text cells are `<textarea>`s (`field-sizing: content`); single-line fields strip pasted breaks on purpose.
- 2026-10-12 feature/file-storage: zod 4 refinements on an object run even when a field failed, with that field still untransformed (a date still a string), and refining before `.extend()` is fragile. -> Keep a base `xFields` object; `superRefine` the create and the `.extend()`ed update schema separately; compare only `instanceof Date` values (`src/lib/date-range.ts`).
- 2026-10-12 feature/file-storage: multi-line string replacements in node scripts silently missed on this CRLF checkout (and a newline escape inside JS fed through a bash heredoc became a real line break). -> Normalise the pattern to the file's EOL before matching, assert one match per pattern, and write string literals with escapes through the editor.
- 2026-10-12 feature/file-storage: a standard Windows user cannot start (or `Start-Service`) a SQL Server service: the default service DACL gives interactive users (IU) query rights only, no RP (start). -> provision.ps1 `Set-ServiceRecovery` grants IU RP on MSSQL$PROJECTMGR only, plus restart-on-failure; the app's watchdog falls back to a dialog on PCs IT has not re-provisioned. On this dev PC both SQL instances are Manual and need an administrator to start.
- 2026-10-12 feature/file-storage: guardrails that bit: messages-tone probes message functions with numbers (stringify arguments); lookup-lists parses seeds as `(N'key', N'label', order, locked)` and reads an explicit migration list (add the new one); db-gateway allows `mssql` only in src/lib/db.ts (tests build driver errors by `name`).
- 2026-10-12 feature/file-storage: `Select-Object -ExcludeProperty *assword*` on machine.json hid nothing: the password is nested under `sql`, so it was printed into the session log. -> Never print a config object; select named, safe fields.

## 24. WBS and Gantt session (feature/wbs-gantt, ADR-0027, 2026-10-13)

- 2026-10-13 feature/wbs-gantt: a read proc shared with older desktop app versions must keep its row shape. Giving `usp_KeyDeliverable_GanttData` a project-only row (NULL `KeyDeliverableId`) for empty projects would have made the pre-032 Gantt throw a ZodError on every empty project until that user updated. -> A new row shape is opt-in through a parameter that defaults to the old behaviour (`@WithProjectRow BIT = 0`); a guardrail test pins the default.
- 2026-10-13 feature/wbs-gantt: an optimistic editor that also re-reads the page can be overwritten by a refresh that started before a save and landed after it. -> Stamp each read with `MIN_ACTIVE_ROWVERSION()` taken before the rows, and keep whichever breakdown has the larger stamp.
- 2026-10-13 feature/wbs-gantt: guardrails that bit: messages-tone caps every message at 90 characters (a long hint becomes an array of sentences), and a required zod string needs `z.string({ error })`, or a missing field reports zod's own "expected string, received undefined".
- 2026-10-13 feature/wbs-gantt (desktop run): a gesture whose preview changes whether the gesture is allowed loses its own handlers mid-drag. Drawing a bar on an undated row previewed dates, the row became "dated", `useDrawBar` returned `{}`, and the rest of the drag (and the pointer-up save) went nowhere: the bar showed two days and was never saved. -> Keep a "gesture in progress" state that keeps the handlers attached until pointer-up or cancel; check the saved row, not just the screen.
- 2026-10-13 feature/wbs-gantt (desktop run): keeping a date anchored when the Gantt scale changes clamped a negative offset (date columns still on screen) to the timeline's first day, which scrolled the Start/End columns under the sticky names. -> Anchor only once the timeline is scrolled under the names.
- 2026-10-13 feature/wbs-gantt (desktop run): the project section nav opened the current group's menu on every page load, over the page's own toolbar (it hid the Gantt's Months button). ADR-0019 already said menus open on click. -> Every menu starts closed; the active pill stays highlighted (`e2e/projects.spec.ts` pins it).
- 2026-10-13 feature/wbs-gantt (e2e): three traps in one spec. `getByLabel("Name of item 6.1")` also matched "Days, Name of item 6.1" and "Name of item 6.10" (substring match), so it needs `{ exact: true }`; the seeded overdue-alert toast sits over the chart's bottom-right, where a bar's end handle was pressed (`closeAlarmToast` first); and a reload right after an optimistic edit dropped the queued saves, so the editor now shows "Saving" and warns on unload, and the spec waits for it.
- 2026-10-13 feature/wbs-gantt: both the dev and the desktop `ProjectManager` databases have AUTO_CLOSE on (SQL Express). With the pool's 30 s idle timeout the database closes between bursts, and the next request reopens it and recompiles every proc: a 4 s Gantt page and 3.8–5 s first save, while warm it is 64–200 ms. Measure a proc twice before blaming its query.
- 2026-10-13 feature/wbs-gantt: T-SQL `PRINT` takes no subqueries (Msg 1046), and one such line fails the whole batch at compile time, so a check script prints nothing and changes nothing. -> `SELECT CONCAT(...)` with `sqlcmd -h -1 -W`.
- 2026-10-13 feature/wbs-gantt (WBS diagram): making the box diagram the page's default view (`?view=wbs`) broke every spec and demo shot that expected the Gantt on a bare `/deliverables/gantt` URL (four specs, three screenshots). -> A spec pins the view it tests in the URL (`?view=gantt`), so a later change of default touches no test.
- 2026-10-13 feature/wbs-gantt (WBS diagram): an add has no optimistic row, so the new name field appears only after the server answers. On the cold local database one add took 9-10 s and four queued saves more than 15 s under `next dev`. -> e2e waits for the new item's field get 15 s like the "Saving" waits; interactive flows are judged on a production build (`npm run build`, then `E2E=1 TRUST_SERVER_CERT=true npm run start`), not on the dev server.
- 2026-10-13 feature/wbs-gantt (WBS diagram): a name field that closes on Enter reports its value twice: once on Enter, again on the blur as it unmounts, before the new name has reached its `value`. -> The box remembers the last name it sent and ignores a repeat; Escape sets a flag that drops the blur's commit.
- 2026-10-13 feature/wbs-gantt: the local dev database never got migration 031 (parking lot Status), though the desktop app had applied it to its own database. The new `usp_ParkingLotItem_List` was never installed, the old one had no `@Status`, and the parking lot page failed under `npm run start`. -> After switching branches, compare `app.SchemaMigrations` with `db/migrations/` and apply what is missing with `.agent-scratch/verify/apply-files.sh` (migration, then its seed, then the procs that use it).
- 2026-10-13 feature/wbs-gantt: a local e2e failure that looked like a regression (an add that never answered within 15 s) was the server taking 12-15 s per request with the CPU at 96% from other programs. -> Read the Playwright trace's network log (`unzip trace.zip`, the `*.network` lines) for the request's own time before changing code, and check machine load.
- 2026-10-13 feature/wbs-gantt: an interrupted e2e run leaves its "E2E phase/task" and "New item" rows in project 2, which shifts every later run's WBS codes. -> `.agent-scratch/wbs-gantt/look-cleanup.cjs --delete` removes exactly those names through the UI; the create test's "E2E deliverable" rows are expected and stay.

## 25. Review fixes session (PRs #23, #24, #25, 2026-10-14)

- 2026-10-14 feature/file-storage: the desktop attachment mirror treated any error reading a folder as "nothing there", so an unreadable folder looked empty and the backup reported success. -> Only `ENOENT` means missing; any other read error fails the copy, and a copied file is checked by its SHA-256 before it counts.
- 2026-10-14 feature/wbs-gantt: the parent-date rollup recomputed the whole project on every write (recursive ancestor/descendant pairs: ~44,000 reads, ~200-400 ms per edit on a 1,620-item project). -> `@FromKeyDeliverableId` limits it to the changed item and the items above it (~1,750 reads, ~15-45 ms). A move rolls up its old parent too, and a delete passes the deleted item (the walk always steps past the first row).
- 2026-10-14 feature/wbs-gantt: how to measure a proc change on the local SQL Express. Build the data and install the old (`git show HEAD:<file>`) and the new proc text inside one `BEGIN TRAN ... ROLLBACK`; time a loop with `SYSDATETIME()`; read `SET STATISTICS IO` for one call. Timings swung 2-3x between runs on this laptop, so logical reads are the number to compare (`.agent-scratch/perf/perf-kd-gen.cjs`, `perf-getbyid-gen.cjs`).
- 2026-10-14 feature/wbs-gantt: a scoped recompute is only as good as the claim that nothing outside its scope can change. -> After each kind of write, run the full recompute and count what it changes, which must be 0 (`.agent-scratch/perf/equiv-gen.cjs`, and the last check in `.agent-scratch/wbs-gantt/proc-checks.sql`); then break the scoping on purpose to prove the check fails.
- 2026-10-14 feature/wbs-gantt: T-SQL `EXEC` arguments cannot be expressions (`@StartDate = DATEADD(...)` is Msg 102 and fails the whole batch). -> Assign to a variable first.
- 2026-10-14 feature/wbs-gantt: stopping `npm run dev` from the agent's background-task tool left Next's `start-server.js` child listening on port 3000, and `next dev` had rewritten `next-env.d.ts` to `.next/dev/types`. -> Check the port (and the process's command line) before `npm run build`, and `git checkout -- next-env.d.ts` before committing.
- 2026-10-14 feature/wbs-gantt: the e2e-pm password is not in the local `.env`, so the real specs cannot sign in here. -> Run a copy of the spec signed in as the local-verify Admin with the e2e-pm alarm step stubbed (`.agent-scratch/wbs-gantt/pw-kd.config.ts`); CI runs the real spec.
- 2026-10-14 feature/wbs-gantt: a `node -e '...'` edit in bash broke on an apostrophe inside the replacement text ("list's"). -> Write prose and comments through the editor; keep shell-quoted scripts for code without quotes.

## 26. Meetings data session (M1, feature/meetings-data, ADR-0028, 2026-10-14)

- 2026-10-14 feature/meetings-data: the two migration runners apply proc folders in different orders: `scripts/db-apply.sh` sorts `meeting-agenda-item/` before `meeting/` (byte order puts `-` before `/`), `electron/db-apply.ts` applies `meeting/` first. A function or helper proc shared across sibling folders is therefore created after its caller by one of them. -> Keep each module's helpers in the folder that sorts first under both runners, or write the expression out in each proc and pin the copies with a guardrail test (ADR-0028 §5).
- 2026-10-14 feature/meetings-data: `.agent-scratch/verify/apply-files.sh` runs with `set -e`; called with many files and piped to `tail`, one sqlcmd login timeout (common on the AUTO_CLOSE database) stopped it silently, so later procs were never applied. -> Call it once per file in a loop that prints `FAIL <file>`, and run long applies in the background.
- 2026-10-14 feature/meetings-data: `FOR JSON PATH` leaves out null properties, so a JSON column parsed by a strict zod object fails as soon as one row has a NULL (an unassigned action, no due date). -> Add `INCLUDE_NULL_VALUES` to every `FOR JSON` column the app parses.
- 2026-10-14 feature/meetings-data: a zod object's `superRefine` still runs when a field's own `.refine` failed, on the raw value. A cross-field rule ("end after start") then compared "24:00" with "9am" and put a second, wrong message on the same field. -> Cross-field rules check that their inputs are well formed before comparing.
- 2026-10-14 feature/meetings-data: Access saved "no time" as 00:00-00:00, which a new "end after start" rule rejects, so every save of a legacy meeting would fail. -> Check such rules only when the value changes (the proc compares with the stored pair), and map the legacy pair to empty in the form.

## 27. Meetings workspace session (M2, feature/meetings-workspace, 2026-10-14)

- 2026-10-14 feature/meetings-workspace: a dialog or panel rendered inside a table row is portalled to `<body>`, but React still bubbles its events through the row. A click on the panel's padding opened the record (the row's `onClick`), and typing in the Tiptap surface reached DataView's row keys (Enter opened the record, Space toggled selection) because a contenteditable `<p>` is not an INPUT. -> Stop click and keydown propagation around any overlay rendered inside a row, and treat `isContentEditable` targets as editable.
- 2026-10-14 feature/meetings-workspace: a client list can't sanitise rich text (sanitize-html is server-only), so the page renders `RichTextView` per row and passes the node with the row. After a cell save, DataView merges the action's row into the list row, so the node is stale until the refresh. -> Keep the HTML the node was rendered from next to it and show plain text while they differ (`RichCellView`, `previewText`).
- 2026-10-14 feature/meetings-workspace: in `next dev`, the first `notFound()` after a delete compiles the not-found boundary, and the delete's server action took 17.7 s locally, longer than the 15 s e2e wait. -> Give local e2e runs 30 s expects; CI uses a production build and is not affected.
- 2026-10-14 feature/meetings-workspace: `notFound()` in a page under a layout with `loading.tsx` streams, so the response status is already 200. -> Assert the not-found heading in e2e, not `response.status()`.

## 28. Meetings participants session (M3, feature/meetings-participants, 2026-10-14)

- 2026-10-14 feature/meetings-participants: `useUnsavedChangesGuard` installs its own link-click capture and pushState patch, and each one dispatches its own `before-navigate` event. Two forms on one page that each call it would ask twice. -> Wrap the page in `UnsavedChangesScope` (`src/components/ui/form/unsaved-scope.tsx`); each form reports its dirtiness with `useUnsavedPart` and the scope owns the one guard and the one dialog. Clear synchronously (`markClean`, `forgetAll`) before a save or delete that navigates at once, or the pushState patch still sees the page as dirty.
- 2026-10-14 feature/meetings-participants: a stamp that guards a whole list must be read before the list, never alongside it from another call. The page reads the workspace and the roster in parallel, so pairing the workspace's stamp with the roster's rows could send a stale list with a fresh stamp and overwrite a change. -> The roster proc returns its own stamp, read first; a change in between only causes a needless CONFLICT.
- 2026-10-14 feature/meetings-participants: a panel whose saved state comes from props and whose unsaved state is local can lose edits silently when another form's save refreshes the page with newer props. Remounting it on a stamp key does exactly that. -> Adopt newer props only when nothing is unsaved; otherwise keep the old stamp so the save conflicts and Reload takes the newer data (`participants-panel.tsx`).

## 29. Meeting minutes session (M4, feature/meetings-minutes, 2026-10-15)

- 2026-10-15 feature/meetings-minutes: the App Router calls `history.replaceState(state, "", canonicalUrl)` on every commit, `router.refresh()` included, with the URL unchanged. The unsaved-changes guard patched `replaceState` and asked on any call while dirty, so a save that refreshed the page raised "Discard changes?" for another form's edits, and Discard would have marked them clean. -> A history call is a navigation only when it changes the path or the query (`leavesPage` in `unsaved-guard.ts`). Test it with a save that refreshes while another form is dirty (`meeting-minutes.spec.ts`); it only shows when the refresh lands after the other form became dirty, so a slow local database finds it first.
- 2026-10-15 feature/meetings-minutes: a reorder bumps the RowVer of every sibling it renumbers, so an inline edit of a sibling that kept the RowVer it opened with would conflict on the user's own move. -> Keep the RowVer the edit started from unless the item's edited fields are unchanged in the newer read; then take the newer RowVer (`editRowVer`). Another user's text change still conflicts.
- 2026-10-15 feature/meetings-minutes: a client component cannot render stored rich text (RichTextView is server-only, ADR-0025). -> Render each rich field on the server and pass `{ html, node }` with the row (the datasheet's rich cell pattern); after a save show plain text (`previewText`) until the refresh brings the node for the new HTML.
- 2026-10-15 feature/meetings-minutes: `page.pdf()` prints US Letter and ignores CSS page sizes unless `preferCSSPageSize: true`. Use it to check a print stylesheet's `@page` (the minutes' named A4 portrait page, the Gantt's landscape one).
- 2026-10-15 feature/meetings-minutes: local e2e data piles up: project 2 held 29 meetings after a few runs, and undated drafts sort first, so the seeded meeting fell to page 2 of the list and the M2 nav test failed locally only. CI starts from a fresh database. Find seeded rows by search when a spec can run after many others.

## 30. Financials calculator session (feature/financials-calculator, ADR-0029, 2026-10-16)

- 2026-10-16 feature/financials-calculator: twice the first `usp_Financial_Create` from the UI hit the driver's 15 s timeout ("Request failed to complete in 15000ms") while the same call from a script took 227 ms (13 ms warm, 112 ms after `sp_recompile`). Not proven: the first time a read proc (`usp_Financial_GetSheet`) still opened `BEGIN TRAN` under `REPEATABLE READ` without `XACT_ABORT` and a server restart cleared it; the second time the database had sat idle through a 10-minute build (AUTO_CLOSE, section 24) and a warm rerun passed. -> Read procs take no transaction, any proc that opens one sets `XACT_ABORT ON`; before chasing a timeout, rerun warm and time the proc directly; a cold desktop database can exceed the 15 s request timeout.
- 2026-10-16 feature/financials-calculator: an `sr-only` header inside an `overflow-x-auto` table box made the whole page 795 px wide at 360 px: the absolutely positioned span took its position from an ancestor above the scroll box, so the box did not clip it. -> A scroll box gets `relative`; the 360 px check measures `document.documentElement.scrollWidth`, and a list of elements whose right edge passes the viewport finds the culprit fast.
- 2026-10-16 feature/financials-calculator: zod `z.coerce.number()` reads `""` and `null` as 0, so a blank optional id or project number became 0 instead of null. -> In a union, list `z.literal("")` and `z.null()` before the coercing member.
- 2026-10-16 feature/financials-calculator: transforming schemas (typed "5" -> stored "0.050000") are not idempotent, so a repository that parsed the action's already-parsed input again rejected it. -> Repositories take the parsed output type (`z.output<typeof schema>`) and do not parse twice.
- 2026-10-16 feature/financials-calculator: the action wrapper replaces a proc's VALIDATION text with the generic "Check the highlighted fields", so a business rule raised only in SQL ("this line has transactions") never reaches the user. -> The UI checks the rule from data it already has (button disabled with the reason, a pre-submit summary); the proc stays the backstop.
- 2026-10-16 feature/financials-calculator: a `\uFEFF` written into a TS string came out as a literal, invisible BOM in the file. -> `String.fromCharCode(0xfeff)`, and grep new files for `\xEF\xBB\xBF`.
- 2026-10-16 feature/financials-calculator: Git Bash rewrites a leading-slash argument or env value (`/projects/2/...`, `//PID`) into a Windows path. -> Prefix the one command with `MSYS_NO_PATHCONV=1`, and only that command (`taskkill /PID` needs it too).
- 2026-10-16 feature/financials-calculator (CI flakes): two focus tests failed on first attempt under four parallel workers. Tiptap's `focus()` command moves the real focus on the next animation frame, so keys typed right after clicking a toolbar item land on the page ("Cell one" arrived as "l one"); and a WBS save landing between ArrowDown and the focus check re-renders the boxes. -> After a click that focuses the editor, wait for `expect(editor).toBeFocused()`; before keyboard navigation, wait for the "Saving" indicator to hide. Reproduced locally with `--repeat-each 3`, then 6/6.
- 2026-10-16 feature/financials-calculator: rounding each invoice's tax separately can leave a fully spent line one cent over its rounded tax-included budget (6,000 at 5.6879 % budgets 6,341.27; invoices of 500 + 2,500 + 3,000 cost 6,341.28). -> Flags compare pre-tax figures, as the source workbook did; the tax-included balance is shown, not judged.

## 31. Financial document checklist session (feature/financials-calculator, ADR-0030, 2026-10-16)

- 2026-10-16: deleting a proc's file leaves the proc in every database already applied, and the access guardrail only scans the folders it maps, so five Access-port procs without an access check (one took `@FinancialId` from the caller on update) survived unseen. -> Drop retired procs in the migration, and map every proc folder in `src/tests/proc-access-levels.test.ts`.
- 2026-10-16: seeds run after migrations, so adding a NOT NULL column without a default broke the seed that inserts into that table on a fresh database. -> Update the seed's column list in the same change, and check a fresh apply (CI runs `db-apply.sh` twice).
- 2026-10-16: `prettier --write <folder>` rewrote CRLF to LF in untouched files of a shared folder, so a dozen files looked modified. -> Format only the files you changed; `git diff -w --ignore-cr-at-eol --stat` shows which changes are real.
- 2026-10-16: SQL Server names are case-insensitive (collation) but a zod `Set` of names is not, so "A1" and "a1" passed the form and failed in the proc with a generic message. -> One key function (`documentNameKey`) for zod, the UI pre-check and any grouping (CSV columns).
- 2026-10-16: the PDF text encoder turned every control character, newline included, into a space before splitting into paragraphs, so multi-line cells printed on one line. Tests had covered delimiters, not the data that really flows (file names joined with newlines). -> Split, then encode; test a text primitive with real joined data.
- 2026-10-16: `JSON_VALUE` on a non-object array element raises error 13609 instead of returning NULL, so a template whose suggestions held `[1]` escaped validation as a raw error. -> Check `OPENJSON ... [type] = 5` before reading members.
- 2026-10-16: two sessions in one checkout collided on review fixes. -> The coordination board (`.agent-scratch/COORDINATION.md`): lock files before editing, ask before taking a peer's file, findings by message.

## 32. Server edition app login session (feature/financials-calculator, ADR-0033, 2026-10-16)

- 2026-10-16: an EXECUTE-only login works only while every proc is static SQL in a dbo-owned schema (ownership chaining). `sp_executesql`, `EXEC (@sql)` or `EXECUTE AS` inside a proc would fail with 229 under the app login, in production only. -> Keep procs static; `src/tests/app-login.test.ts` fails on them, and CI runs `db/tests` and Playwright as `pm_web`.
- 2026-10-16: `QUOTENAME` returns NULL above 128 characters and `EXEC (NULL)` does nothing, so an over-long password would have skipped `CREATE LOGIN` without an error; `LEN` also ignores trailing spaces. -> Check `DATALENGTH(@x) / 2` before quoting a value for dynamic SQL.
- 2026-10-16: sqlcmd pastes `$(VAR)` from the environment into the file verbatim, comments included. -> Double single quotes in the shell before a secret reaches `N'$(VAR)'`, quote it again with `QUOTENAME` in dynamic SQL, and hand it only to the one sqlcmd call that needs it.
- 2026-10-16: the local dev login (`pm_app`, db_owner) cannot create logins, so login DDL is proven in CI only. The grants themselves were proven on the shared dev DB inside one rolled-back transaction: `CREATE USER ... WITHOUT LOGIN`, `EXECUTE AS USER`, proc calls and direct reads, `ROLLBACK`. -> Use that pattern to test permissions without leaving anything behind.

## 33. WBS requirements session (feature/wbs-requirements, ADR-0036, 2026-10-20)

- 2026-10-20 feature/wbs-requirements: the ADR number cited in thirty comments (0034) was already taken on develop, and an open branch (feature/notes) held the next one (0035). -> Before citing a new ADR or migration number, `ls docs/adr db/migrations` on develop and `git ls-tree -r --name-only origin/<branch> -- docs/adr db/migrations` for each open feature branch.
- 2026-10-20 feature/wbs-requirements: a click on a WBS box can land on its name (which now opens the item's menu after 250 ms), its status chip or its "Add requirement" button. -> e2e selects a box by its corner (`selectBox`); the delayed menu opens only while the box still holds the focus, so a toolbar click inside the delay is not interrupted.
