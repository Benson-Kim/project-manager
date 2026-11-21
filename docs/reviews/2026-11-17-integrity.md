# Attribute 7: Integrity

## 1. Executive Summary

### Integrity rating: **5/10 - Signed licence documents, row versions and check constraints hold the core shapes, but the one-per rules for codes and trials live in read-then-write code and several derived fields drift from their source**

What integrity means for this review:

- A redeem code binds to exactly one machine, and a trial is granted once per person and once per PC.
- A spent verification code always has a committed licence behind it.
- The licence the desktop app enforces is the one the service signed, and every cache of it changes when it changes.
- To-do alerts follow the to-do: its dates, its priority list and who may still see it.
- Each due alert reaches each subscriber once, on the right local day and time.

The structural base is good. Licences are Ed25519-signed documents that the app verifies before use. The D1 schema checks `kind` and keeps `licence_identity` unique for each email and machine pair. `usp_ChecklistItem_SetDetails` checks the row version, validates the date order and confirms the alert recipient has access when it writes.

The weakness is that the rules the business states as "one" are enforced in application code that reads, decides and then writes. Two concurrent redeems both bind the same code. Two concurrent trials from one email on two PCs both pass. Derived fields (the alert day, the gate cache, the SQL mirror of the licence) are not updated or invalidated when their source changes.

## Highest-priority findings

| Severity | Finding |
|---|---|
| High | INT-01: two concurrent redeems bind one code to two machines |
| Medium-high | INT-02: one trial per email and per PC is read-then-insert, so concurrent requests get two trials |
| Medium-high | INT-03: the verification code is spent before the licence is saved |
| Medium-high | INT-04: push deliveries do not recheck access, so removed members still get to-do titles |
| Medium | INT-05: clearing both dates keeps the old alert day |
| Medium | INT-06: priority is not checked against the managed list |
| Medium | INT-07: the free-update limit is signed and displayed but never enforced |
| Medium | INT-08: deliveries are stamped once per subscription per day and compare local alert times with UTC |
| Medium | INT-09: the gate cache outlives a licence change by up to 30 seconds |

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

Reviewed: the 14 commits c0f982b..2aaa030 (PR #60, merged as 8a89381).

| Component | Data it owns |
|---|---|
| Licence service (`services/licence`) | `licence`, `pending_code`, `rate_hit` in D1 |
| Desktop licence client (`electron/licence`) | DPAPI state file, SQL mirror via `usp_Licence_Save` |
| Licence gate (`src/lib/licence`) | none; derives status from the stored licence and the clock |
| To-do alerts (`db/procs/checklist-item`, `db/procs/alert-subscription`, dispatch route) | `app.TodoAlert`, `app.AlertSubscription.LastPushSentAtUtc` |

Not in scope: the 33 npm advisories and signing (security report), and outbound timeouts (reliability report).

# 3. Detailed Findings

## INT-01 - High: two concurrent redeems bind one code to two machines

### Evidence

`services/licence/src/service.ts:143-151`

```ts
const record = await this.deps.store.findByRedeemCode(await sha256Hex(code));
if (!record || (record.machineHash && record.machineHash !== machineHash)) {
  return fail("invalid_code");
}
const bound = { ...record, machineHash };
await this.deps.store.saveLicence(bound);
```

`services/licence/src/d1-store.ts:96-100`

```sql
ON CONFLICT (licence_id) DO UPDATE SET kind = excluded.kind, machine_hash = excluded.machine_hash, ...
```

### Why it matters

Both requests read `machine_hash IS NULL`, both pass the check, and both get a signed licence. The upsert then overwrites the binding, so the last writer wins in the database. Both PCs keep a valid signed document. One paid code ends up running on two PCs, and the service's record no longer matches what was issued. The per-machine rate limit does not help, because the two requests come from different machines.

### Recommended remediation

Bind with one conditional statement and treat zero changed rows as a lost race.

```ts
async bindRedeemCode(codeHash: string, machineHash: string): Promise<LicenceRecord | null> {
  const row = await this.db
    .prepare(
      `UPDATE licence SET machine_hash = ?1
       WHERE redeem_code_hash = ?2 AND (machine_hash IS NULL OR machine_hash = ?1)
       RETURNING ${LICENCE_COLUMNS}`,
    )
    .bind(machineHash, codeHash)
    .first<LicenceRow>();
  return row ? toRecord(row) : null;
}
```

`redeem` signs only the record this statement returns.

### Tests

- Two `redeem` calls for one code with different machines, run with `Promise.all` against the D1 store: exactly one succeeds and the other returns `invalid_code`.
- The same machine redeeming twice gets the same licence both times.

## INT-02 - Medium-high: one trial per email and per PC is read-then-insert

### Evidence

`services/licence/src/service.ts:100-103`

```ts
const known = await store.findByIdentity(emailHash, machineHash);
const same = known.find((l) => l.emailHash === emailHash && l.machineHash === machineHash);
if (same) return ok(await this.signLicence(same));
if (known.length > 0) return fail("trial_used");
```

`services/licence/schema.sql:14-15`

```sql
CREATE UNIQUE INDEX IF NOT EXISTS licence_identity ON licence (email_hash, machine_hash)
  WHERE email_hash IS NOT NULL;
```

### Why it matters

The rule is one trial per email and one trial per PC. The only database guarantee is one licence per email and PC pair. Two verifications that arrive together from one email on two PCs both find nothing and both insert. That gives two 14-day trials, which is the abuse this design exists to stop.

### Recommended remediation

Make each half of the rule a partial unique index and map the constraint error to `trial_used`.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS trial_email ON licence (email_hash) WHERE kind = 'trial';
CREATE UNIQUE INDEX IF NOT EXISTS trial_machine ON licence (machine_hash) WHERE kind = 'trial';
```

### Tests

- Two concurrent verifications for one email on two machines: one trial and one `trial_used`.
- Inserting a second trial row for a machine directly fails with a constraint error.

## INT-03 - Medium-high: the verification code is spent before the licence is saved

### Evidence

`services/licence/src/service.ts:98`, then the licence save further down the same method:

```ts
await store.saveCode(key, null);
const known = await store.findByIdentity(emailHash, machineHash);
```

### Why it matters

If the licence save fails, or the Worker is stopped between the two writes, the tester's code is gone and no licence exists. A retry with the same code returns `invalid_code`. This is the integrity side of REL-02: a spent code should always have a committed licence.

### Recommended remediation

Write the licence and clear the code in one D1 `batch()`, which runs as one transaction. Keep the existing "same email and machine returns the same licence" branch, so a repeat after a timeout is safe.

### Tests

- A store whose `saveLicence` throws: the code is still pending afterwards, and a retry succeeds.

## INT-04 - Medium-high: push deliveries do not recheck access

### Evidence

`db/procs/alert-subscription/usp_TodoAlert_ListPushDeliveries.sql:33-40`

```sql
FROM app.AlertSubscription AS s
INNER JOIN auth.[User] AS u ON u.UserId = s.UserId AND u.IsDeleted = 0 AND u.IsActive = 1
INNER JOIN app.TodoAlert AS a ON a.IsDeleted = 0
INNER JOIN app.TodoItem AS t
    ON t.TodoItemId = a.TodoItemId AND t.IsDeleted = 0
   AND COALESCE(a.RecipientUserId, t.CreatedBy) = s.UserId
```

`usp_ChecklistItem_SetDetails.sql` checks `a.AccessLevel IS NOT NULL` for the recipient, but only when the to-do is saved.

### Why it matters

Access is checked when the alert is written, not when it is sent. Someone removed from a project keeps getting push notifications that carry the to-do's title until the to-do changes. Under the policy rules, a removed permission must stop every derived output, not only new writes.

### Recommended remediation

Join the same access function the rest of the to-do procs use, so the send-time read applies the current membership, and add the `checklists:read` permission check for the recipient.

### Tests

- Database test: a recipient removed from the project gets no rows from `usp_TodoAlert_ListPushDeliveries`.
- A recipient whose role loses `checklists:read` gets no rows.

## INT-05 - Medium: clearing both dates keeps the old alert day

### Evidence

`db/procs/checklist-item/usp_ChecklistItem_SetDetails.sql:92-95`

```sql
DECLARE @AlertDay DATETIME2 = CAST(COALESCE(@DueDate, @StartDate) AS DATETIME2);
UPDATE app.TodoAlert
SET AlertDay = COALESCE(@AlertDay, AlertDay),
```

### Why it matters

The user clears the start and due dates, but the alert keeps its old day and keeps firing. The derived field no longer follows its source.

### Recommended remediation

`SET AlertDay = @AlertDay` (null when both dates are cleared). The list proc already skips `AlertDay IS NULL`.

### Tests

- Set a due date, then clear both dates: `AlertDay` is null and the to-do is not in the push list.

## INT-06 - Medium: priority is not checked against the managed list

### Evidence

`usp_ChecklistItem_SetDetails.sql:37-39`

```sql
SET @Priority = NULLIF(TRIM(@Priority), N'');
IF LEN(@Priority) > 255
    THROW 50004, N'VALIDATION:A priority has at most 255 characters', 1;
```

`db/procs/lookup-list/usp_LookupList_AssertLabel.sql` exists and is not called here.

### Why it matters

The priority picker offers the managed list, but the proc accepts any text. A direct call or an old client can store labels that the filters and colours do not know. The rule is to reject forbidden values when they are written.

### Recommended remediation

Call `usp_LookupList_AssertLabel` for the priority list when `@Priority` is not null, as the other list-backed procs do.

### Tests

- Saving a priority that is not in the list is rejected with a validation error.
- A label in the list and a cleared priority both save.

## INT-07 - Medium: the free-update limit is signed and displayed but never enforced

### Evidence

`services/licence/src/service.ts:210-215` signs `updatesUntil: kind === "free" ? this.now() + FREE_UPDATES : null`. In `electron` it is read only by `ipc.ts:92` and `licence-text.ts:38` for display. The updater does not read it.

### Why it matters

The signed licence says free updates end on a date, and the app shows that date, but it installs every later release. The business rule and the shipped behaviour disagree.

### Recommended remediation

Before downloading, the updater compares the release date with `updatesUntil` from the verified licence and skips releases published after it, showing why. Release dates come from the update feed, not the local clock.

### Tests

- A free licence whose `updatesUntil` is before the release date: the update is not offered.
- A full licence (`updatesUntil` null): the update is offered.

## INT-08 - Medium: deliveries are stamped once per subscription per day, comparing local alert times with UTC

### Evidence

`usp_TodoAlert_ListPushDeliveries.sql:21-22, 45-54`

```sql
DECLARE @NowDate DATE    = CAST(@NowUtc AS DATE);
DECLARE @NowTime TIME(0) = CAST(@NowUtc AS TIME(0));
...
AND (s.LastPushSentAtUtc IS NULL OR CAST(s.LastPushSentAtUtc AS DATE) < @NowDate)
```

`usp_AlertSubscription_RecordDelivery.sql:18` stamps `LastPushSentAtUtc` on the subscription, not on the alert.

### Why it matters

- An alert due at 15:00 is skipped if the same subscription got any push earlier that day, so it arrives a day late.
- `AlertDay` and `AlertTime` are local, but they are compared with the UTC date and time. In Nairobi (UTC+3) an 08:00 alert fires at 11:00, and alerts due before 03:00 land on the wrong day.

### Recommended remediation

Record deliveries per alert, subscription and local day, with a unique key, and compute "now" in the organisation's time zone once.

```sql
CREATE TABLE app.TodoAlertDelivery (
    TodoAlertId INT NOT NULL, AlertSubscriptionId INT NOT NULL, AlertDate DATE NOT NULL,
    SentAtUtc DATETIME2 NOT NULL,
    CONSTRAINT PK_TodoAlertDelivery PRIMARY KEY (TodoAlertId, AlertSubscriptionId, AlertDate));
```

### Tests

- Two alerts for one subscriber, due at 09:00 and 15:00: both are delivered on the same day.
- An 08:00 alert in UTC+3 is due at 05:00 UTC, not 08:00 UTC.
- Recording one delivery twice leaves one row.

## INT-09 - Medium: the gate cache outlives a licence change by up to 30 seconds

### Evidence

`src/lib/licence/gate.ts:82-86`

```ts
if (cached && wall >= cached.until - GATE_CACHE_FOR && wall < cached.until)
  return cached.status;
...
cached = { status, until: wall + GATE_CACHE_FOR };
```

### Why it matters

After a licence is activated, the server still answers read-only for up to 30 seconds. After a trial ends, writes are still accepted for up to 30 seconds. Nothing invalidates the cache when the licence changes, and the window is not capped at `expiresAt`.

### Recommended remediation

Cap `until` at the licence's next status change (`min(wall + GATE_CACHE_FOR, expiresAt)`), export an `invalidate()` that activation and redeem call, and share one in-flight read between concurrent callers.

### Tests

- Activation followed at once by a write: the write is accepted.
- A licence expiring 5 seconds after a cached read: a write 6 seconds later is refused.

## INT-10 - Medium-low: the DPAPI state and the SQL mirror can diverge

### Evidence

`electron/licence/manager.ts:250-254`

```ts
this.deps.store.write(this.state);
...
await this.deps.mirror?.write({ licence, checkIn, mark }).catch(() => undefined);
```

### Why it matters

The desktop app enforces the DPAPI file, while the server gate reads the SQL mirror. If the mirror write fails, the two disagree, and nothing records it or retries. The window and the server then show different licence states.

### Recommended remediation

Log mirror failures, retry on the next check-in, and have the mirror compare `checkIn` so an older state never overwrites a newer one.

### Tests

- A mirror that fails once: the next check-in writes it, and a warning is logged.

## INT-11 - Medium-low: any app login can overwrite or wipe the stored licence

### Evidence

`db/procs/licence/usp_Licence_Save.sql:12` and `app-login.sql:22`: `usp_Licence_Save` is granted to `app_executor`, which every app login holds.

### Why it matters

The stored licence is signed, so a forged one fails verification. But a wipe or an older copy can be written by any code that runs as the app. Wiping it fails closed, and an older copy can bring back a time mark from earlier (see INT-12).

### Recommended remediation

Grant `usp_Licence_Save` only to the desktop's own login, and refuse a save whose time mark is older than the stored one.

### Tests

- Saving a state with an older mark than the stored one is rejected.

## INT-12 - Low: the time mark is not kept as an in-memory maximum

### Evidence

`src/lib/licence/gate.ts:42-66`: ADR-0068 section 7 says the gate keeps the highest time mark it has seen, but the gate uses each stored mark as read.

### Why it matters

Restoring an older stored state (INT-11) moves the clock anchor back, which stretches the offline grace and the trial.

### Recommended remediation

Keep `max(seenMark, stored.mark)` in the gate and use it for every check.

### Tests

- Read a mark of T, then a stored mark of T-1 day: the gate keeps T.

## INT-13 - Low: the failed-attempts counter is read-modify-write

### Evidence

`services/licence/src/service.ts:90-96`: `saveCode(key, { ...pending, attempts: pending.attempts + 1 })`.

### Why it matters

Parallel wrong codes lose increments, so more than the attempt limit can be tried. The `verify` rate limit (10 an hour) bounds this, which keeps it Low.

### Recommended remediation

`UPDATE pending_code SET attempts = attempts + 1 WHERE key = ? RETURNING attempts`.

### Tests

- Ten parallel wrong codes leave `attempts = 10`.

# 4. Invariant Matrix

| Invariant | Kind | Enforced by | Strength |
|---|---|---|---|
| A licence has a valid kind | Structural | `CHECK (kind IN ('trial','free','full'))` | strong |
| One licence per email and machine pair | Structural | unique index `licence_identity` | strong |
| One redeem code per licence | Structural | `redeem_code_hash TEXT UNIQUE` | strong |
| A redeem code binds to one machine | Transactional | read then upsert in `redeem` (INT-01) | weak: application only, races |
| One trial per email, one per machine | Identity | `findByIdentity` then insert (INT-02) | weak: application only, races |
| A spent code has a committed licence | Transactional | two separate writes (INT-03) | weak |
| Failed attempts are counted exactly | Transactional | read-modify-write (INT-13) | weak, bounded by rate limit |
| The app enforces only licences the service signed | Policy | Ed25519 verification before use | strong |
| An enforcing build has the public key and service URL | Policy | missing values fall back silently (SEC-09) | weak: no build check |
| Gate status follows the stored licence | Policy | 30 s cache, no invalidation (INT-09) | medium |
| Free updates stop at `updatesUntil` | Policy | display only (INT-07) | missing |
| Only the desktop writes the stored licence | Policy | grant to `app_executor` (INT-11) | weak |
| The time mark never moves back | Historical | not kept as a maximum (INT-12) | weak |
| The DPAPI state and SQL mirror agree | Transactional | mirror errors swallowed (INT-10) | weak |
| To-do edits do not overwrite newer changes | Transactional | `RowVer` check, 409-style `CONFLICT` | strong |
| Start date is on or before due date | Computational | proc validation | medium (no table constraint) |
| The alert day follows the to-do dates | Computational | `COALESCE` keeps the old day (INT-05) | weak |
| Priority is from the managed list | Policy | length check only (INT-06) | missing |
| Alert recipients can see the to-do | Policy | checked on write, not on send (INT-04) | weak |
| Each due alert reaches each subscriber once a day | Transactional | per-subscription stamp (INT-08) | weak |
| Alert times use the local day and time | Computational | compared with UTC (INT-08) | wrong |

# 5. Strengths Worth Preserving

- **Signed licences.** `signLicence` in `services/licence/src/service.ts` signs every document, and the client verifies the signature before it stores or enforces anything. A copied or edited state file cannot grant more than the service issued.
- **Row versions on to-do edits.** `usp_ChecklistItem_SetDetails` throws `CONFLICT` when `@RowVer` does not match, so a stale edit never overwrites a newer one.
- **Write-time access check for recipients.** The same proc only picks recipients with `a.AccessLevel IS NOT NULL`. INT-04 should reuse this, not replace it.
- **Idempotent repeat for the same identity.** `verify` returns the existing licence for the same email and machine, which makes INT-03's fix safe to retry.
- **`XACT_ABORT ON`** in the alert procs, so a failed statement rolls back the whole proc.
- **Constraint-backed identity pair.** `licence_identity` is the pattern INT-02 extends.

# 6. Prioritized Roadmap

| When | Work | Findings |
|---|---|---|
| Now | Conditional bind for redeem codes | INT-01 |
| Now | Recheck access in the push list | INT-04 |
| Now | Clear the alert day with the dates; check priority against the list | INT-05, INT-06 |
| Now | Cap and invalidate the gate cache | INT-09 |
| Now | Enforce `updatesUntil` in the updater | INT-07 |
| Next | Partial unique indexes for trials; one D1 batch for code and licence | INT-02, INT-03 |
| Next | Per-alert delivery table and one time zone | INT-08 |
| Next | Atomic attempts counter | INT-13 |
| Later | Narrow the licence save grant; keep the time mark as a maximum; retry and log mirror writes | INT-10, INT-11, INT-12 |

# 7. Recommended Tests

**Licence service (D1 store, in-memory Miniflare or the existing store fake with a real SQL engine)**

- Concurrent redeem of one code from two machines: one winner (INT-01).
- Concurrent trials for one email on two machines: one trial (INT-02).
- `saveLicence` throws: the code is still pending and a retry succeeds (INT-03).
- Ten parallel wrong codes: `attempts = 10` (INT-13).

**Database (disposable copy, with the `USE ProjectManager;` line stripped)**

- A removed member gets no push rows (INT-04).
- Clearing both dates nulls `AlertDay` (INT-05).
- A priority outside the list is rejected (INT-06).
- Two alerts on one day both deliver; a UTC+3 alert is due at the right UTC time; recording twice leaves one row (INT-08).

**Gate and desktop**

- Activation then an immediate write is accepted; a lapse inside the cache window refuses writes (INT-09).
- A free licence does not offer a release published after `updatesUntil` (INT-07).
- A failing mirror is retried and logged (INT-10).
- An older time mark never replaces a newer one (INT-11, INT-12).

# 8. Final Verdict

The signed-document design and the to-do row versions are sound and should stay. The licence service's one-per rules are not yet enforced by the database, so they hold only while requests arrive one at a time. Fix INT-01, INT-04, INT-05, INT-06, INT-07 and INT-09 (the reviewed fix list) before any build turns enforcement on. INT-02, INT-03 and INT-08 should follow before the beta grows past a handful of testers.

## Review checks

| Check | Result |
|---|---|
| `sed -n` on `service.ts`, `d1-store.ts`, `schema.sql`, both alert procs, `SetDetails.sql` | ✅ evidence lines confirmed on 2026-11-18 |
| `grep -rn updatesUntil electron src` | ✅ read only by `ipc.ts` and `licence-text.ts` (display) and `policy.ts` (parsing) |
| `git ls-files \| grep` for the alert and lookup procs | ✅ `usp_LookupList_AssertLabel.sql` exists and is not called by `SetDetails` |
| Concurrency tests against D1 | ⚠️ not run; review is code reading only (challenge mode) |
| Database tests on a disposable copy | ⚠️ not run; listed in section 7 |
| lint, prettier, tsc, unit tests | ⚠️ run once at the end of the fix work, not per report |
