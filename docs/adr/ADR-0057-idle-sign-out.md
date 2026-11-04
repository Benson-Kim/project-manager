# ADR-0057: Idle sign-out per user

- Status: Accepted
- Date: 2026-11-04

## Context

STANDARDS §4 promised an "8 h idle expiry", but the session cookie's 8 h `maxAge` ran from sign-in: no
route the app uses re-issued it (the proxy only reads it with `getToken`, and `auth()` in server
components and actions drops the refreshed cookie). A PC left asleep overnight was always signed
out, however recently it was used, and nobody could choose a shorter or longer time.

## Decision

1. Each user picks their idle sign-out time in Settings > Sign-in: 15 min, 30 min, 1 h, 2 h, 4 h,
   8 h (the default) or Never. It is stored in `app.UserPreference.IdleTimeoutMinutes` (migration
   060, 0 = Never, CHECK 0 or 5..1440) and saved by `usp_UserPreference_SetIdleTimeout`, keyed on
   the session's user only.
2. The JWT carries `idleTimeoutMinutes` and `lastActiveAt`. The jwt callback checks idleness first
   and returns null once the time has passed (Auth.js then clears the cookie), so a request to the
   session route cannot revive an idle session. An `update` only means "reload": the value is
   re-read from the database, never taken from the request body. Tokens minted before 060 use
   their `iat` and the 8 h default.
3. The proxy applies the same rule (`src/lib/auth/idle-timeout.ts`, shared with the browser) and
   sends an idle user to `/login?reason=expired`.
4. The browser counts only real input (pointer, key, wheel, touch). At most once a minute it calls
   `GET /api/auth/session`, which re-issues the cookie with the new activity time; nothing that
   runs in the background may call it. Tabs share their last activity through localStorage. Every
   30 s, and when the page becomes visible again, an idle tab signs out through the normal
   sign-out (push subscriptions retired, Logout audited when the session is still readable).
5. `maxAge` becomes 30 days: the cap for Never. SessionVersion revocation is unchanged.

## Consequences

- An active user stays signed in; a PC left asleep past the user's time signs out on wake.
- Never still ends after 30 days without use.
- The server's activity time can lag the browser's by up to a minute (the heartbeat interval).
