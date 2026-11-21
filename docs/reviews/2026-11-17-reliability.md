# Attribute 11: Reliability

Scope: the 14 commits c0f982b..2aaa030 (licence Worker, licence gate, desktop licence client, signing pipeline, to-do push alerts). Challenge mode: code reading, failure modelling and the chaos-engineer pre-mortem. No faults were injected into any shared host.

## 1. Executive Summary

### Reliability rating: **5/10 - Bounded client timeouts and a sensible offline grace, but one path bug fails every PC closed and several steps lose work when a dependency fails halfway**

What reliability means here:

- A licensed or trial PC keeps working through a slow or absent licence service, a restart, or a failed disk write.
- A trial code is not used up unless a licence is actually issued.
- Push alerts go out once per alert, on time, and one bad row does not stop the rest.
- Background jobs (dispatch, prune) can overlap or re-run without harm.

The desktop client puts a 15 s `AbortSignal.timeout` and `redirect: "error"` on every service call. The machine-id read has a 5 s timeout. The offline grace is a single constant (`OFFLINE_GRACE`, 24 h), and push dispatch runs in bounded batches.

The main weakness is the failure path. The machine-id bug makes every enforcing build fail closed on every PC. The Worker uses up a trial code before the licence is saved. The mail call has no timeout. One malformed row fails the whole dispatch run.

## Highest-priority findings

| Severity | Finding |
|---|---|
| Critical | REL-01: the machine-id read always fails, so an enforcing build opens read-only on every PC |
| High | REL-02: a trial code is used up before the licence is saved |
| Medium-high | REL-03: the mail send has no timeout, and a mail failure is shown as a connection problem |
| Medium | REL-04: one malformed row fails the whole push dispatch run |
| Medium | REL-05: push is stamped once per day per subscription, mixing UTC and local alert time |
| Medium | REL-06: the 30 s gate cache can serve a stale status in both directions |
| Medium | REL-07: a failed state write skips the SQL mirror write without a trace |

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

| Component | Files | Reliability question |
|---|---|---|
| Desktop licence client | electron/licence/machine-id.ts, start.ts, manager.ts, service-client.ts | Does the app start and stay usable through faults? |
| Licence gate | src/lib/licence/gate.ts, policy.ts | Is the status correct and fresh? |
| Licence Worker | services/licence/src/service.ts, worker.ts, handler.ts, d1-store.ts | Do partial failures lose codes or licences? |
| Push alerts | src/app/api/internal/todo-alerts/dispatch/route.ts, src/lib/push/sender.ts, db/procs/usp_TodoAlert_*.sql | Once, on time, isolated failures? |

Commands: `git log c0f982b..2aaa030`, `rg -n "timeout|AbortSignal|fetch\(" services/licence electron/licence src/lib/push`, `rg -n "schema.parse|\.map\(" src/app/api/internal/todo-alerts src/modules/todos/server`.

# 3. Detailed Findings

## REL-01 - Critical: the machine-id read always fails, so an enforcing build opens read-only on every PC

### Evidence

`electron/licence/machine-id.ts:18` passes `"HKLM\SOFTWARE\Microsoft\Cryptography"`. In a normal JS string `\S` and `\M` are not escapes, so the value is `HKLMSOFTWAREMicrosoftCryptography`. reg.exe fails, `readMachineHash` resolves `null`, and `start.ts:64-68` returns the closed state.

### Why it matters

No enforcing build has shipped, so nobody is affected today. The first enforcing build would open read-only on every PC, with no way to start a trial.

### Recommended remediation

```ts
const KEY = String.raw`HKLM\SOFTWARE\Microsoft\Cryptography`;
```

### Tests

- A unit test asserts the exact `execFile` arguments (`["query", KEY, "/v", "MachineGuid"]`).
- A parse test runs against captured `reg query` output.

## REL-02 - High: a trial code is used up before the licence is saved

### Evidence

`services/licence/src/service.ts:98` runs `await store.saveCode(key, null);`, and the licence is saved only at `:117` (`await store.saveLicence(record);`). The client gives up after 15 s (`electron/licence/service-client.ts:35`).

### Why it matters

A D1 failure between those lines, or a slow request the client abandons, leaves the tester with a used code and no licence. Their next try fails with `invalid_code`. Key rotation failing on the client has the same effect (manager.ts:127-135).

### Recommended remediation

Save the licence and the tester first, then clear the code, and make a repeat redeem from the same machine return the existing licence. A D1 `batch()` makes the steps atomic.

### Tests

- Simulate a store whose `saveLicence` throws, and assert the code is still pending.
- Redeem twice from the same machine, and assert the same licence id both times.

## REL-03 - Medium-high: the mail send has no timeout, and a mail failure is shown as a connection problem

### Evidence

`services/licence/src/worker.ts:27` calls `await fetch(endpoint, { method: "POST", ... })` with no `signal`. A non-2xx response throws `mail <status>`, and `handler.ts:187` returns 500. The desktop shows that as "check the connection".

### Why it matters

A slow mail provider holds the request until the Worker's wall limit, and the 15 s client timeout fires first. The tester is told their network is at fault while the code may have been stored.

### Recommended remediation

Give the mail call `signal: AbortSignal.timeout(8000)`. Map mail failures to a distinct `mail_unavailable` error that the desktop shows as "We could not send the email. Try again in a few minutes."

### Tests

- Inject a mailer that never resolves, and assert the response arrives within the timeout with `mail_unavailable`.
- Inject a mailer that returns 500, and assert the same error.

## REL-04 - Medium: one malformed row fails the whole push dispatch run

### Evidence

`src/modules/todos/server/alert-subscriptions.ts:25` and the dispatch path parse every row with `rows.map(schema.parse)`. The route (`dispatch/route.ts:78`) has no catch around `listDuePushDeliveries()`.

### Why it matters

One bad subscription row (for example an endpoint that fails validation) returns 500 on every run. No alert goes out to anyone until someone repairs the row by hand.

### Recommended remediation

Parse each row with `safeParse`, log and skip the bad ones, and count them in the response (`skipped`).

### Tests

- Seed one valid and one malformed row, and assert one is sent and one is skipped, with status 200.

## REL-05 - Medium: push is stamped once per day per subscription, mixing UTC and local alert time

### Evidence

`db/procs/usp_TodoAlert_ListPushDeliveries.sql:36-54` filters on one delivery stamp per subscription per day. `usp_TodoAlert_RecordDelivery.sql:20` writes that stamp, and the due check compares a UTC clock with the local `AlertTime`.

### Why it matters

A user with two alerts due on the same day gets only the first. Near midnight, the UTC/local mix fires alerts a day early or a day late, depending on the offset.

### Recommended remediation

Record deliveries per alert and subscription, with a unique key on (TodoAlertId, SubscriptionId, AlertDate). Compute "due" in the organisation's time zone in one place.

### Tests

- Two alerts due the same day for one subscription: both are listed.
- An alert at 00:30 local time with UTC+3: listed on the local day only.

## REL-06 - Medium: the 30 s gate cache can serve a stale status in both directions

### Evidence

`src/lib/licence/gate.ts:82-86` keeps `cached = { status, until: wall + GATE_CACHE_FOR }`. It is not dropped when a licence is redeemed or expires, there is no single-flight on a miss, and the cache can outlive `expiresAt`.

### Why it matters

For up to 30 s after a redeem, writes are still refused, which a tester reads as "the code didn't work". For up to 30 s after expiry, writes are still accepted. Concurrent requests on a miss each read SQL.

### Recommended remediation

Cap `until` at the licence's own `expiresAt`. Expose `invalidate()` and call it after the mirror write. Share one in-flight promise on a miss.

### Tests

- Expiry 5 s ahead: the status changes at expiry, not 30 s later.
- After `invalidate()`, the next call reads the store.
- Ten concurrent misses: `read` is called once.

## REL-07 - Medium: a failed state write skips the SQL mirror write without a trace

### Evidence

`electron/licence/manager.ts:251` runs `this.deps.store.write(this.state);`. If it throws, the mirror write at `:253` never runs. The mirror failure itself is swallowed (`.catch(() => undefined)`).

### Why it matters

The web gate reads the mirror, so it lags the desktop's real state, and nothing records why.

### Recommended remediation

Write the mirror in its own try, log both failures to main.log, and retry the mirror on the next check-in.

### Tests

- A store that throws: assert the mirror is still written and an error is logged.

## Lower-severity findings

- **REL-08 - Medium-low:** a Worker outage of more than 24 h locks trial users out (`src/lib/licence/policy.ts:179`, `OFFLINE_GRACE`). This is a product decision; it is stated here so it is explicit.
- **REL-09 - Medium-low:** the gate uses wall time (`gate.ts:79`), while the desktop is anchored to server time (`manager.ts:129`). A PC clock running more than 24 h fast stays blocked while the UI shows "Trial: n days left".
- **REL-10 - Low:** push dispatch has no single-flight. Two overlapping cron calls can each send the same delivery before it is recorded.
- **REL-11 - Low:** rate limits use fixed windows, which allow twice the limit across a window edge. Rows for attacker-chosen buckets are pruned, and a skipped prune is silent (d1-store.ts:156).
- **REL-12 - Low:** feedback and consent rows are never pruned.

# 4. Dependency Failure Table

| Dependency | Caller | Timeout | Retry | Idempotency | Degradation | Tested? |
|---|---|---|---|---|---|---|
| Licence Worker (HTTPS) | electron/licence/service-client.ts | ✅ 15 s `AbortSignal.timeout` | None (user retries) | ❌ redeem is not idempotent (REL-02) | Offline grace 24 h, then read-only | Partly (offline path) |
| D1 | services/licence/src/d1-store.ts | Platform limit only | None | ❌ code cleared before licence saved | 500 to client | ❌ |
| Resend mail API | services/licence/src/worker.ts:27 | ❌ none (REL-03) | None | Code stored before send | 500, shown as "check the connection" | ❌ |
| Windows registry (reg.exe) | electron/licence/machine-id.ts | ✅ 5 s | None | Read only | Fails closed (REL-01: always) | ❌ |
| DPAPI state file | electron/licence/manager.ts | Synchronous | None | Overwrite | Throws, skips mirror (REL-07) | ❌ |
| SQL mirror | manager.ts:253, gate.ts | Driver default | None | Overwrite | Silent; gate lags | ❌ |
| Web push services | src/lib/push/sender.ts:26 | Not checked (options not reviewed) | Next run | ❌ stamp per subscription per day (REL-05) | 404/410 retire the subscription | Partly |
| SQL Server (dispatch list) | dispatch/route.ts:78 | Driver default | Next cron run | n/a | ❌ one bad row 500s the run (REL-04) | ❌ |

# 5. Strengths Worth Preserving

- `LicenceServiceClient` (service-client.ts:30-38): a timeout, `redirect: "error"`, and one typed `offline` error for every network fault.
- `OFFLINE_GRACE` in `src/lib/licence/policy.ts:3`: one constant shared by the desktop and the gate.
- The dispatch loop in `dispatch/route.ts:87-95` caps outbound connections at `DISPATCH_CONCURRENCY`.
- `isGoneSubscription` in sender.ts retires 404/410 subscriptions instead of retrying them forever.
- The machine-id read has a timeout and `windowsHide`, so a hung reg.exe cannot block startup.

# 6. Prioritized Roadmap

- **Now:** REL-01 (path), REL-02 (redeem order and idempotency), REL-06 (cache cap and invalidate).
- **Next:** REL-03 (mail timeout and distinct error), REL-04 (safeParse per row), REL-05 (per-alert stamp, one time zone), REL-07 (mirror retry and logging).
- **Later:** REL-08 (grace policy decision), REL-09 (anchored gate time), REL-10 (dispatch lock), REL-11 (sliding window), REL-12 (retention job).

# 7. Recommended Tests

- **Desktop client:** exact registry arguments; store write throws but mirror still written; key rotation failure keeps the code usable.
- **Worker:** `saveLicence` throws leaves the code pending; double redeem returns one licence; mailer hang returns `mail_unavailable` within the timeout.
- **Gate:** expiry respected within 1 s; `invalidate()` forces a read; concurrent misses share one read.
- **Push:** malformed row skipped with 200; two alerts the same day both delivered; local-midnight boundary; overlapping dispatch sends once.

# 8. Final Verdict

Reliable enough for today, because no build enforces the licence. Before an enforcing build: fix REL-01 and REL-02, and cap the gate cache (REL-06). Before many testers rely on push alerts: fix REL-04 and REL-05.

## Review checks

- ✅ `git log c0f982b..2aaa030`: 14 commits in scope.
- ✅ Timeout search over outbound calls: three found (client 15 s, reg.exe 5 s; mail has none).
- ⚠️ Fault injection: not run. Challenge mode only; the tests above are the injection plan.
- ⚠️ Web push timeout: the `sendNotification` options were not reviewed.
- ⚠️ Tests, typecheck and lint: run once at the end of the fixes.
