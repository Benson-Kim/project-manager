# ADR-0068: Licensing and the 14-day beta trial

- Status: Accepted
- Date: 2026-11-17
- Module: desktop (licence client), licence service. Builds on ADR-0003, ADR-0014, ADR-0032 and ADR-0034

## Context

Outside beta testers get a 14-day trial; a tester who gives feedback gets a free licence (perpetual,
one PC, one year of updates). The trial must not restart on reinstall and must not stretch when the
Windows clock is set back. At expiry the app becomes read-only and export keeps working (user,
2026-11-17). The paying client's installs must never be locked by any of this. The database may move
to PostgreSQL, so nothing here may depend on SQL Server beyond one adapter.

A purely offline trial can always be beaten. Time therefore comes from our server, and the PC only
carries signed evidence of it.

## Decision

### 1. A small licence service of our own (`services/licence/`)

A fetch-style handler (`Request -> Response`, no framework, no runtime dependency) that runs on any
small serverless host; the first target is Cloudflare Workers with D1. Storage, email and the signing
key sit behind ports, so the host can change without touching the rules.

- `POST /v1/trial/start` (email, machine hash) sends a 6-digit code. The answer is the same whether
  or not the email or machine is known, so it reveals nothing.
- `POST /v1/trial/verify` (email, machine hash, code) returns the trial licence. The start and end
  dates are **server time**. A trial is keyed by email **and** by machine: the same pair gets the
  same trial back (reinstall changes nothing); a machine or an email that already had a trial gets
  no second one.
- `POST /v1/checkin` (licence ID, machine hash, nonce) returns the current licence and the server
  time, signed. A trial the admin converted comes back as the free licence here.
- `POST /v1/licence/redeem` (code, machine hash) binds a granted free or full licence to a PC.
- `POST /v1/feedback` and `POST /v1/consent` record feedback and consents (section 6).
- `/v1/admin/*` (bearer token, compared as hashes in constant time) lists testers, their feedback and
  consents, and grants free or full licences. `/admin` is a static page that calls them.

Codes are stored as SHA-256 hashes, live 10 minutes, allow 5 attempts, and starting is rate limited
per email and per machine. Licence IDs are 128-bit random values.

### 2. Everything the app trusts is Ed25519-signed by the service

A signed document is `{ kid, payload, sig }`: `payload` is base64url JSON, `sig` is Ed25519 over the
payload bytes. The app embeds only public keys, by `kid`, so a key can be rotated by shipping the new
public key one release before the service starts using it. The private key lives only in the
service's secret store.

Every document also carries `typ` (`licence` or `checkin`), `aud` (`modulus-desktop`) and `iss`
(`modulus-licence-service`). The desktop and the bundled server check all three, and the type that
fits the place the document is used, after the signature and before any other field, and refuse a
document where one is missing or different. No build that enforces licensing has shipped, so no
document without these claims is held by a user.

- Licence: `{ v, typ, aud, iss, licenceId, kind: trial | free | full, machineHash, emailHash, issuedAt, startsAt,
  expiresAt | null, updatesUntil | null }`. Free and full licences have no `expiresAt`.
- Check-in: `{ v, typ, aud, iss, licenceId, machineHash, nonce, serverTime, licence }` where `licence` is the
  current signed licence.

### 3. The machine hash ignores the install

`machineHash = SHA-256("modulus-machine:" + Windows MachineGuid)`. The plan said MachineGuid plus the
install ID; adding the install ID would change the hash on every reinstall and let a new email start
a new trial, which is exactly what this must prevent. The install ID is still sent with each request
for support and seat counting, but nothing is keyed by it. A Mac build will use `IOPlatformUUID`.

### 4. The app's clock never trusts the wall clock going back

`electron/licence/` keeps a trusted time:

`trustedNow = max(lastServerTime + monotonic elapsed since it, highWaterMark, wall clock)`

Monotonic time is `process.hrtime`. The wall clock can only move trusted time **forward**: setting it
back is ignored; setting it forward only brings expiry closer. The high-water mark is saved every
minute and on every check-in, in two places:

- a file under the app's user-data folder, encrypted with Electron `safeStorage` (DPAPI on Windows);
- the database (`app.LicenceState`, migration 079), through a port, so a PostgreSQL adapter can
  replace the SQL Server one.

Each copy carries an HMAC-SHA-256 under a per-install key kept only in the `safeStorage` file. A
copy that fails its HMAC or signatures is dropped; the larger valid mark wins. With neither copy
the app must check in online before it can be used, so deleting files only forces a check-in.

### 5. Check-in, offline and expiry

The app checks in at start and every six hours. The interval is shorter than the 24-hour offline
grace on purpose, so a PC that is online keeps several check-ins in hand before the grace runs out.
A trial is usable while `trustedNow < expiresAt` and
`trustedNow - lastServerTime <= 24 h`. Past 24 hours offline the app asks to reconnect and is
read-only until it does. Because trusted time only advances while the app runs when it is offline,
staying offline buys at most 24 hours of use, and the first check-in jumps to real server time.
Free and full licences need no check-in: they are perpetual and bound to the machine hash, so an
offline office is never locked out. Converting a trial swaps the stored licence only; data, install
and database are untouched.

States: `active`, `expired`, `reconnect` (offline too long), `unlicensed` (no valid licence) and
`off` (licensing not enforced in this build).

### 6. Feedback and consent

A "Send feedback" item opens a small window that posts to `/v1/feedback`. Consent to quote the
feedback as a testimonial and consent to use the tester's name are two separate, unticked choices,
each recorded with its time and the exact quote shown. Either can be withdrawn later from the same
window; the service keeps the history and the latest record wins (Kenya Data Protection Act 2019).
The free licence is granted for feedback, never for a review or a positive one.

### 7. Writes are refused in the action wrapper, not only in the UI

The Next.js server cannot see the Electron process's monotonic clock, so Electron hands it the same
evidence through the database: the server-signed licence and check-in, and the HMAC'd mark. Electron
passes the public keys and the mark key to the server in its environment (ADR-0032), overriding any
value from the user's environment. `src/lib/licence/` verifies all three, keeps its own in-memory
maximum of the mark (an older copy written back is ignored) and computes the same state.

`action()` (ADR-0003) asks the gate before validating input: anything but `active` or `off` returns
`LICENCE_INACTIVE` and the handler never runs. Actions that only read (export, print, preview)
declare `licence: "read"` and keep working. Signing in still works, so a tester can always open,
read and export their data.

### 8. Enforcement is off until a build turns it on

The packaged `package.json` carries `"licensing": "enforce"` only in beta builds (written by
`scripts/desktop/build.mjs` when the release setting `PM_LICENSING` is `enforce`, inside the asar,
covered by the asar-integrity fuse). The same build bakes in `PM_LICENCE_PUBLIC_KEYS` and
`PM_LICENCE_SERVICE_URL`, and stops when either is missing from an enforcing build. Without it the state is `off`
and nothing is checked, so the paying client's channel never enforces. Before any of their builds
enforce, each of their PCs receives a full licence through `/v1/licence/redeem`.

## Consequences

- Setting the clock back, reinstalling and deleting the state files do not extend a trial. A VM
  snapshot or a restored disk image can replay at most the 24 hours of offline use each time.
- Someone who runs the bundled server by hand, outside the app, skips the gate, as does someone who
  patches the app. Electron fuses (asar integrity, only load from asar) protect the Electron side of
  the licence client only. Run-as-node stays on, because Electron forks the Next server with it, and
  the Next server's code (`resources/standalone`) sits outside the asar, so no fuse covers the gate
  in the action wrapper. Code signing (ADR-0034) shows the files were changed after release, but
  nothing stops a changed copy from running. This is accepted for a trial: the aim is that setting
  the clock back and reinstalling do nothing, not that a determined tester cannot patch the app.
- The Next server checks the licence state it reads from the database, with the time mark sealed by
  the app. A database administrator who copies back older rows and sets the PC's clock back to match
  can stretch a trial on that PC until its next check-in, in the Next server only: the app itself
  keeps its own sealed copy and its own high-water mark. This is accepted: it needs both database
  rights and a clock set back, and the next check-in corrects it.
- `app.LicenceState` needs a PostgreSQL twin when the database port starts (ADR-0069).
- The service sees only an email for the trial, a machine hash, the licence ID and the app version.
  Nothing from projects is ever sent; the privacy notice says so.
- A new runtime dependency is not needed: Ed25519, HMAC and SHA-256 come from `node:crypto` and Web
  Crypto (ADR-0014).
