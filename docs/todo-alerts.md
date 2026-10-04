# Todo alert delivery

The service worker uses Web Push, not a timer. Service workers are short-lived:
the browser may terminate an idle worker and start a new instance for the next
`push` event. `public/sw.js` handles each push independently and keeps only
that event alive with `event.waitUntil()`.

The application server now persists subscriptions at
`POST /api/alert-subscriptions`. A trusted deployment scheduler must call
`POST /api/internal/todo-alerts/dispatch` once per minute with
`Authorization: Bearer $ALERT_PUSH_DISPATCH_TOKEN`. The dispatch route queries
due alerts and sends encrypted VAPID payloads through `web-push`, for example:

```json
{ "todoAlertId": 42, "title": "Submit report" }
```

The stable notification tag makes retries replace the same notification. A
push event does not require an open app tab; clicking opens or focuses `/todo`.

Web Push requires a secure context (HTTPS in production; localhost is the
development exception) and a user-visible permission grant. Chromium and
Firefox support it on supported platforms; Safari supports it from 16.4, with
iOS/iPadOS requiring the web app to be added to the Home Screen. Some browsers
also require a user gesture before showing the permission prompt. Private
browsing, missing VAPID configuration, or unavailable subscription storage can
still prevent background delivery. The client detects those cases and falls back to a
60-second foreground poll while a tab is open. With no open tab, the todo page's
normal due-alert rendering is the final fallback; closed-tab delivery is not
claimed where Web Push is unavailable.

Configure `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`,
`WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`, and a random
`ALERT_PUSH_DISPATCH_TOKEN`. Keep the private key and dispatch token server-side.

## Push-service endpoint allowlist

Subscription endpoints are validated against an explicit hostname allowlist in
`src/modules/todo-items/schemas/alert-subscription.ts` (`PUSH_SERVICE_HOSTS`).
This prevents an authenticated caller from registering an arbitrary HTTPS URL
and weaponising the scheduler's outbound HTTP request (SSRF).

The allowlist currently covers:

| Browser / engine | Push service hostname |
|---|---|
| Chrome, Edge, Opera | `fcm.googleapis.com` |
| Firefox | `updates.push.services.mozilla.com`, `push.services.mozilla.com` |
| Safari / WebKit | `web.push.apple.com` |

### Maintenance procedure

When a major browser ships support for Web Push through a **new** hostname:

1. Confirm the new hostname in the browser vendor's release notes or Push API
   spec (do not accept a user-reported hostname as authoritative).
2. Add the hostname to `PUSH_SERVICE_HOSTS` in
   `src/modules/todo-items/schemas/alert-subscription.ts`.
3. Add a corresponding positive test case in
   `src/modules/todo-items/schemas/alert-subscription.test.ts`.
4. Update the table above and the inline JSDoc comment in the schema file.

Do **not** broaden the allowlist to accept wildcard domains or non-`https:`
protocols. Unknown endpoints must remain rejected rather than trusted.
