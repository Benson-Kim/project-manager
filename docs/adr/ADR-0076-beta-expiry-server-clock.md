# ADR-0076 — Beta builds expire 14 days after first start, dated by the licence service

Date: 2026-11-27
Status: Accepted 2026-11-27 for decisions 1-4 and 6, and for decision 5 with
a separate beta update channel (chosen 2026-11-27).
Code so far (2026-11-27): the service's `GET /health`; a fix so a fresh
database setup applies cleanly; the beta channel's build name, app id and
installer name (`PM_CHANNEL=beta`), with a build guard that allows enforcement
only on that channel; a separate data folder, app id, machine config, database and
database login for the beta app. It still shares the client app's database engine
instance, so the separation is by configuration, not by permission. The beta
update channel is written and unit tested but not proven by a build or an install,
so no beta installer may go out yet. The beta feed will be a public repository,
ElianDigitalSolutions/modulus-beta (chosen 2026-11-27, not yet created), until
a server of our own hosts all app downloads, beta and sold. Nothing is
published. Not deployed.

## Context

The USER wants beta testers' copies to stop after 14 days. The expiry must
hold even if a tester sets the PC clock back.

ADR-0068 already designs this, and the code exists:

- trial licences signed by our own licence service (`services/licence/`)
- check-in at start and every 6 h
- a trusted clock that cannot run backwards
- 24 h offline grace
- read-only plus export once the licence expires

ADR-0072 adds the 112 hours of use limit. None of it is live yet:

- licensing is off in every build;
- the service has never been deployed (`wrangler.toml.example` only);
- no build passes `PM_LICENSING=enforce`.

This ADR records only what is still open: which server is the date
authority, where it runs, and how beta builds differ from the paying client's
builds.

## Decision

1. **The date authority is our licence service's signed check-in.**
   - `/v1/checkin` returns `serverTime` inside the Ed25519-signed document
     (ADR-0068), bound to a client nonce, so a replayed reply is rejected.
   - The app never trusts a plain HTTPS `Date` header or a public time
     server. A TLS-intercepting proxy with a local root CA can rewrite those;
     it cannot forge our signature.
   - The trusted date is
     `max(lastServerTime + monotonic elapsed, saved high-water mark, wall clock)`,
     so setting the clock back gains nothing.
2. **The window is 14 calendar days from `startsAt`**, which the service sets
   at the first `/v1/trial/start`. Reinstalling or wiping app data does not
   reset it, because the service keys the trial on
   `machineHash + emailHash`. ADR-0072's 112-hour limit stays alongside
   it (USER, 2026-11-27): whichever runs out first ends the trial.
3. **Offline grace is 24 h** after the last good check-in (USER,
   2026-11-27). The app then shows "reconnect": it stays read-only with
   export until a check-in succeeds. The window keeps counting while
   offline. At day 14 the app goes read-only with export, not a full lock
   (USER, 2026-11-27).
4. **Where it runs:** Cloudflare Workers + D1 as designed. For the beta it
   uses the Worker's own `workers.dev` address (USER, 2026-11-27).
   `licence.eliandigitalsolutions.com` needs the domain's DNS moved to
   Cloudflare first, so it waits. The address is baked into each installer,
   so a later move needs a new beta build.
   Production signing keys live only in Worker secrets; the app embeds only
   public keys (`PM_LICENCE_PUBLIC_KEYS`).
5. **Only beta builds enforce.**
   - A separate beta build: its own product name suffix and installer
     name, updater download cache and update feed, built with
     `PM_LICENSING=enforce PM_LICENCE_SERVICE_URL=... PM_LICENCE_PUBLIC_KEYS=...`
     (`scripts/desktop/build.mjs` bakes `"licensing": "enforce"` into
     package.json).
   - A beta build takes its feed only from `PM_UPDATE_URL`, a public HTTPS
     folder (or has none, `PM_UPDATE_FEED=off`). The build refuses to fall back
     to GitHub, whose provider reads the client's newest release. The beta feed
     file is `beta.yml`, so a beta app never reads `latest.yml` and a client app
     never reads `beta.yml`, even if both sat in one place.
   - The client channel's builds keep licensing off, and their feed and release
     path are unchanged. The release workflow publishes only `latest.yml` and
     the client installer names, which a beta build does not write, so no extra
     release-step check was added.
   - The beta feed is published by hand: `beta.yml`, the installer and its
     `.blockmap`. The required-update setting does not reach it.
6. **Privacy:** the service stores only:
   - email
   - machine hash (SHA-256 of the Windows MachineGuid, never the raw value)
   - licence id
   - app version
   - start, expiry and used time

   No project data, no telemetry, no IP log beyond the platform's own
   short-lived request logs.

## Consequences

- One new hosted service to run. If it is down, testers fall back to the
  24 h offline grace and then to read-only; no data is lost.
- Determined attackers can still patch the binary or replay a VM snapshot
  for up to 24 h. This is accepted for a beta (ADR-0068).
- A beta tester who buys gets a full licence through `/v1/licence/redeem`.
  No reinstall is needed.
- Design detail, threat model, slices and USER questions:
  `.agent-scratch/client-feedback-2026-11-24/v21-beta-expiry-design.md`.
