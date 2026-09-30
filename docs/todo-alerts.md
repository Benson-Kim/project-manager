# Todo alert delivery

The service worker uses Web Push, not a timer. Service workers are short-lived:
the browser may terminate an idle worker and start a new instance for the next
`push` event. `public/sw.js` handles each push independently and keeps only
that event alive with `event.waitUntil()`.

The application server must persist `/api/alert-subscriptions` subscriptions
and have a push gateway send, for example:

```json
{ "todoAlertId": 42, "title": "Submit report" }
```

The stable notification tag makes retries replace the same notification. A
push event does not require an open app tab; clicking opens or focuses `/todo`.

Chromium and Firefox support Web Push on supported platforms; Safari supports
it from 16.4, with iOS/iPadOS requiring the web app to be added to the Home
Screen. Permission, browser policy, private browsing, missing VAPID
configuration, or unavailable subscription storage can still prevent
background delivery. The client detects those cases and falls back to a
60-second foreground poll while a tab is open. With no open tab, the todo page's
normal due-alert rendering is the final fallback; closed-tab delivery is not
claimed where Web Push is unavailable.
