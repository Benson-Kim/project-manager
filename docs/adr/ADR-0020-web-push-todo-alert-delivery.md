# ADR-0020 — Event-driven Web Push delivery for todo alerts

Status: Proposed · Date: 2026-09-30 · Reliability follow-up to PR #13

## Context

Service workers are short-lived event handlers. A `setInterval` started from
`activate` is stopped whenever the browser terminates the worker, so it cannot
provide a closed-tab polling guarantee. The project already has SQL Server as
the source of truth and a Next.js server, but no long-lived browser process.

## Decision

- Browser delivery uses the Push API. The client persists each authenticated
  `PushSubscription` through `POST /api/alert-subscriptions`; the worker handles
  each `push` event with `event.waitUntil()` and never owns a timer.
- The server exposes a token-protected `POST
  /api/internal/todo-alerts/dispatch` wake-up. A deployment scheduler calls it
  once per minute; it queries due alerts and active subscriptions through stored
  procedures and sends encrypted VAPID payloads with `web-push`.
- Invalid/expired endpoints (HTTP 404/410) are soft-deactivated. Other send
  failures are logged by subscription id and retried on the next wake-up.
- Browsers without usable Web Push fall back to foreground polling and the
  normal in-app due-alert view. Closed-tab delivery is not promised in that
  capability gap.

## Consequences

Web Push wakes a fresh service-worker instance, so browser worker termination or
zero open tabs no longer prevents delivery. Production needs VAPID keys and a
minute-level scheduler able to reach the internal dispatch route. `web-push` is
an added server-only runtime dependency because it handles Web Push encryption
and VAPID protocol details; its version is recorded in the package manifest and
lockfile job.
