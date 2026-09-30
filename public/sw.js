// Service Worker — Alert poller for Project Manager
// Polls /api/due-alerts every 60 seconds and fires OS notifications even
// when no app tab is open (as long as the browser runs in the background).
// The SW is registered once by AppShell and stays alive across tab closes.
//
// INTENTIONALLY NO FETCH HANDLER AND NO CACHE API USAGE.
// This SW is a notification poller only.  Adding a fetch event listener or
// any caches.open() / cache.put() call would risk storing authenticated page
// responses or session data (/api/auth/session, RSC payloads, project data)
// in CacheStorage, which is NOT partitioned by user and is NOT cleared by
// logoutAction.  On a shared device that would allow an offline request after
// logout to receive the previous user's data.  If offline support is ever
// required, implement a separate, user-aware caching strategy that:
//   1. Excludes /api/auth/*, /api/due-alerts and all authenticated routes.
//   2. Purges private cache entries in the SW's "message" handler when
//      logoutAction posts a { type: "PURGE_PRIVATE_CACHE" } message.

const POLL_INTERVAL_MS = 60_000;

/** Alert IDs notified in this SW lifetime — prevents duplicate notifications
 *  across rapid poll ticks. Cleared only when the SW is terminated. */
const notified = new Set();

async function poll() {
  let alerts;
  try {
    const res = await fetch("/api/due-alerts", { credentials: "include" });
    if (!res.ok) return; // unauthenticated / server error — silently skip
    alerts = await res.json();
  } catch {
    return; // network error — skip this tick
  }

  if (!Array.isArray(alerts) || alerts.length === 0) return;

  for (const alert of alerts) {
    if (notified.has(alert.todoAlertId)) continue;
    notified.add(alert.todoAlertId);
    self.registration.showNotification(alert.title, {
      body: "Your to-do alert is due. Click to open.",
      icon: "/favicon.ico",
      tag: `todo-alert-${alert.todoAlertId}`,
      requireInteraction: false,
      data: { url: "/todo" },
    });
  }
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
  // Start polling immediately after activation.
  setInterval(poll, POLL_INTERVAL_MS);
  void poll();
});

// Open or focus the /todo tab when the user clicks the notification.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/todo";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
