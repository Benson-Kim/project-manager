# Attribute 3: Maintainability

## 1. Executive Summary

### Maintainability rating: **6/10 - Small, single-purpose licence modules with injected clocks and stores, but the code at the edges has no tests and the write check must be remembered in every new write path**

What maintainability means for this review:

- A newcomer can find where the licence rules live and change one without breaking the desktop, the server gate or the service.
- Every write path refuses changes while the licence is inactive, without each author having to remember to.
- The parts that touch the outside world (the registry, the network, D1, mail) are covered by tests.
- Docs and ADRs say what the code does.

The licence work is well split. No file is over 260 lines (`electron/licence/manager.ts` is the largest at 255). Clocks, stores, mirrors and fetchers are injected, so `manager`, `policy`, `gate` and `service` each have focused tests. ADR-0068 records the design, and `services/licence` has its own README and an example `wrangler.toml`.

The weakness is at the edges. `machine-id.ts`, `service-client.ts`, `d1-store.ts`, `handler.ts`, `worker.ts` and `start.ts` have no tests, and the Critical registry-path bug sits in one of them. The "licence allows changes" check is copied into two places, so the next write path will need a third copy.

## Highest-priority findings

| Severity | Finding |
|---|---|
| Medium-high | MAINT-01: the licence code that talks to the registry, network, D1 and mail has no tests |
| Medium | MAINT-02: the write check is copied into `action.ts` and `file-route.ts` |
| Medium | MAINT-03: enforcing builds do not check their release settings |
| Medium-low | MAINT-04: `ConsentChoice` is declared twice |
| Medium-low | MAINT-05: the check-in interval in the code and the commit history disagree |

## Pull request review items

The eight items raised in the pull request review are part of these reports. Each one maps to the findings below, in this report or the other three. The fixes follow separately, each with the tests named in its finding.

| Priority | Item | Covered by |
|---|---|---|
| P1 | DC-1: the machine-id registry path loses its backslashes | SEC-01, REL-01, MAINT-01 |
| P1 | FT-9: push deliveries skip the to-do access check | SEC-06, INT-04 |
| P1 | LS-2: concurrent redeem binds one code twice (licence service only) | SEC-08, INT-01 |
| P1 | DC-8: enforcing builds do not check their release settings | SEC-09, MAINT-03 |
| P2 | FT-10: clearing both dates leaves the old alert date | INT-05 |
| P2 | FT-2: priority is not checked against the managed list | INT-06, security input review |
| P2 | LS-7: the free update limit is only displayed, not enforced | SEC-10, INT-07 |
| P2 | LG-7: the 30 s gate cache can serve a stale status | REL-06, INT-09 |

# 2. Scope

The 14 commits c0f982b..2aaa030 (PR #60). Licence service, licence gate, desktop licence client, signing pipeline and to-do alerts. Sizes from `wc -l`:

| File | Lines |
|---|---|
| `electron/licence/manager.ts` | 255 |
| `services/licence/src/service.ts` | 249 |
| `services/licence/src/d1-store.ts` | 229 |
| `services/licence/src/handler.ts` | 205 |
| `src/lib/licence/policy.ts` | 184 |

# 3. Detailed Findings

## MAINT-01 - Medium-high: the licence code at the edges has no tests

### Evidence

Tests that exist: `electron/tests/licence-{ipc,manager,policy,state-file,text}.test.ts`, `services/licence/tests/service.test.ts`, `src/lib/licence/tests/gate.test.ts`.

No tests for `electron/licence/machine-id.ts`, `electron/licence/service-client.ts`, `electron/licence/start.ts`, `services/licence/src/d1-store.ts`, `services/licence/src/handler.ts` or `services/licence/src/worker.ts`.

### Why it matters

These are the files where the code meets something real. A single test of the registry path would have caught the Critical machine-id bug (SEC-01). The D1 store holds the race behind INT-01, and the handler maps errors to the messages testers see. A change to any of them is checked only by hand today.

### Recommended remediation

Give each one a test through its existing seam: `execFile` for `machine-id`, `fetch` for `service-client` and `worker`, a real SQLite engine for `d1-store`, and `Request` objects for `handler`.

```ts
it("reads MachineGuid from the Cryptography key", async () => {
  const calls: string[][] = [];
  const run = async (_cmd: string, args: string[]) => {
    calls.push(args);
    return "    MachineGuid    REG_SZ    1234\r\n";
  };
  await readMachineId(run);
  expect(calls[0][1]).toBe("HKLM\\SOFTWARE\\Microsoft\\Cryptography");
});
```

### Tests

The test above, plus: `service-client` maps a timeout to `offline`; `handler` returns 429 for `rate_limited` and 400 for bad JSON; `d1-store` round-trips a licence and rejects a duplicate identity.

## MAINT-02 - Medium: the write check is copied into two places

### Evidence

`src/lib/action.ts:166`

```ts
if (options.licence !== "read" && !allowsChanges(await currentLicenceStatus())) {
```

`src/modules/file-storage/handlers/file-route.ts:34`

```ts
if (!safe && !allowsChanges(await currentLicenceStatus())) {
```

### Why it matters

Each write path has to remember the check and build its own refusal. A new API route that writes data and skips it would keep working on an expired licence, and no test would notice.

### Recommended remediation

One function owns the decision and the refusal, and both callers use it.

```ts
export async function refuseIfReadOnly(): Promise<LicenceRefusal | null> {
  return allowsChanges(await currentLicenceStatus()) ? null : licenceRefusal();
}
```

Then add a guardrail test that lists every non-GET route handler and every `action()` without `licence: "read"`, and fails if one does not go through it.

### Tests

- Guardrail: every `route.ts` exporting `POST`, `PUT`, `PATCH` or `DELETE` calls `refuseIfReadOnly` or is on a written allow-list.
- Both callers return the same message for the same status.

## MAINT-03 - Medium: enforcing builds do not check their release settings

### Evidence

The licence public key and service URL are read at build time. A missing value does not stop an enforcing build (SEC-09 in the security report).

### Why it matters

The person cutting a release has to know that both values must be set. If either is missing, the build still ships and fails at the testers' end. Settings that a build depends on should fail the build, not the install.

### Recommended remediation

The release workflow reads both values from the release settings and stops with a clear message when licensing is enforced and either one is empty. This is fix DC-8 in the reviewed list.

### Tests

- A unit test of the build-config check: enforcing with no key fails, not enforcing with no key passes.

## MAINT-04 - Medium-low: `ConsentChoice` is declared twice

### Evidence

`electron/licence/consent.ts:8` and `electron/licence/manager.ts:39` both declare `export interface ConsentChoice`. `ipc.ts:2` imports the one from `manager`.

### Why it matters

Two copies of one contract drift. A field added to one is silently missing from the other.

### Recommended remediation

Keep it in `consent.ts` and import it in `manager.ts` and `ipc.ts`.

### Tests

None needed beyond `tsc`; the compiler enforces one source once the copy is gone.

## MAINT-05 - Medium-low: the check-in interval in the code and the commit history disagree

### Evidence

`electron/licence/manager.ts:19`: `CHECK_IN_EVERY = 6 * 60 * 60 * 1000`. The commit that added it describes an hourly check-in.

### Why it matters

Someone reading the history to understand the offline behaviour gets the wrong number. ADR-0068 is where the interval should be stated.

### Recommended remediation

State the six-hour interval in ADR-0068 next to the 24-hour offline grace, and say why the two differ.

### Tests

None.

# 4. Architecture, Test and Documentation Assessments

## Architecture

- **Dependency direction holds.** `policy.ts` and `gate.ts` are pure functions of the licence, the environment and the clock. `manager.ts` takes its store, mirror, client and clock as dependencies. The Worker's `service.ts` depends on a `Store` interface, and `d1-store.ts` implements it.
- **One rule, three runtimes.** The status rules live once, in `src/lib/licence/policy.ts`, and the desktop and server gate both use them. Keep it that way: the service signs, the policy decides.
- **The write check is the weak seam** (MAINT-02). It is the one rule every new feature must follow and nothing enforces.
- **Sizes are healthy.** The largest file is 255 lines, and each module has one job.

## Tests

| Area | Tested | Missing |
|---|---|---|
| Status rules | `licence-policy.test.ts`, `gate.test.ts` | cache cap and invalidation (INT-09) |
| Desktop manager and state | `licence-manager.test.ts`, `licence-state-file.test.ts` | mirror failure (INT-10) |
| IPC and text | `licence-ipc.test.ts`, `licence-text.test.ts` | sender frame check |
| Licence service rules | `service.test.ts` | concurrent redeem and trial (INT-01, INT-02) |
| Machine id, client, start | none | MAINT-01 |
| D1 store, handler, worker | none | MAINT-01 |
| To-do alert procs | none at the database level | INT-04, INT-05, INT-06, INT-08 |

Clocks are injected everywhere in the licence code, so time-dependent tests can be exact.

## Documentation

- **ADR-0068** (licensing and beta trial) records the design. Keep it, with changes: add the six-hour check-in (MAINT-05), the database guarantees from INT-01 and INT-02, and the build check from MAINT-03.
- **ADR-0034** (update signing) still matches what was built. Keep it.
- **ADR-0069** (embedded PostgreSQL on every platform) is a proposal with no code behind it yet. Keep it marked as proposed.
- **`services/licence/README.md`** and `wrangler.toml.example` explain how to run and deploy the service. They should also say how to roll back a deploy and how to rotate the signing key.

# 5. Suggested Guardrails

| Guardrail | Catches |
|---|---|
| Every write route and action goes through `refuseIfReadOnly` (test over the file tree) | a new write path that ignores the licence (MAINT-02) |
| Enforcing release builds fail without the key and service URL (workflow step) | MAINT-03, SEC-09 |
| Each `electron/licence/*.ts` and `services/licence/src/*.ts` file has a matching test (test over the file tree, with a written exception list) | MAINT-01 |
| No `export interface` name declared in two files under `electron/licence` | MAINT-04 |
| Licence constants (`OFFLINE_GRACE`, `CHECK_IN_EVERY`, trial length) appear in ADR-0068 with the same values (doc test) | MAINT-05 |

# 6. Strengths Worth Preserving

- **Injected dependencies** in `LicenceManager`, `createGate` and the Worker service. They make every fix in this review testable without a network or a real PC.
- **One policy module** (`src/lib/licence/policy.ts`) shared by the desktop and the server.
- **The `licence: "read"` marker** on `action()`. It makes read-only actions explicit at the call site.
- **Small files with one job each.**
- **ADR-0068** written before the code, so the review could check intent against what was built.

# 7. Prioritized Roadmap

| When | Work | Findings |
|---|---|---|
| Now | Tests for `machine-id` and the build-settings check, as part of the reviewed fixes | MAINT-01, MAINT-03 |
| Next | One `refuseIfReadOnly` and its guardrail | MAINT-02 |
| Next | Tests for `service-client`, `d1-store`, `handler`, `worker`, `start` | MAINT-01 |
| Later | Remove the second `ConsentChoice`; update ADR-0068 and the service README | MAINT-04, MAINT-05 |

# 8. Recommended Tests

- `electron/tests/licence-machine-id.test.ts`: the exact registry path; a missing value fails closed with a clear error.
- `electron/tests/licence-service-client.test.ts`: a timeout gives `offline`; a redirect is refused.
- `services/licence/tests/d1-store.test.ts`: round trip; duplicate identity rejected; conditional bind (INT-01).
- `services/licence/tests/handler.test.ts`: each error code maps to its status and message.
- `src/tests/licence-write-guard.test.ts`: the guardrail from MAINT-02.

# 9. Final Verdict

The licence code is easy to read and to change. The modules are small, the rules live in one place, and the seams are there for tests. Two things will cost the next person: the edges are untested, and the write check depends on memory. Add the missing tests alongside the reviewed fixes, and give the write check one owner before the next feature adds a write path.

## Review checks

| Check | Result |
|---|---|
| `wc -l` on the licence modules | ✅ largest file 255 lines |
| `git ls-files` for licence tests | ✅ seven test files; six source files without tests |
| `grep -n allowsChanges` | ✅ two call sites, `action.ts:166` and `file-route.ts:34` |
| `grep -rn ConsentChoice` | ✅ declared in `consent.ts:8` and `manager.ts:39` |
| ADR read for ADR-0034, ADR-0068, ADR-0069 | ✅ done during the challenge review |
| lint, prettier, tsc, unit tests | ⚠️ run once at the end of the fix work, not per report |
