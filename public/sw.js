// Service Worker — event-driven todo alerts for Project Manager.
//
// A service worker is an event handler, not a background process. Browsers may
// stop it at any time, so this file deliberately contains no timer. The server
// push gateway sends one Web Push message per due alert; the browser starts a
// fresh worker for the push event even when the site has no open tabs.

function readPushPayload(event) {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch {
    return null;
  }
}

function alertsFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.alerts)) return payload.alerts;
  if (payload && payload.todoAlertId != null) return [payload];
  return [];
}

async function showAlerts(alerts) {
  await Promise.all(
    alerts
      .filter((alert) => alert && alert.todoAlertId != null && alert.title)
      .map((alert) =>
        self.registration.showNotification(alert.title, {
          body: alert.body || "Your to-do alert is due. Click to open.",
          icon: "/favicon.ico",
          // A stable tag makes a retried push replace the same notification.
          tag: `todo-alert-${alert.todoAlertId}`,
          requireInteraction: false,
          data: { url: "/todo", todoAlertId: alert.todoAlertId },
        }),
      ),
  );
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // claim() is lifecycle housekeeping only; it is not a keep-alive mechanism.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // waitUntil keeps this one event alive until its notification is shown. A
  // later push gets a new worker instance, which is the supported lifecycle.
  event.waitUntil(showAlerts(alertsFromPayload(readPushPayload(event))));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/todo";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(url) && "focus" in client) return client.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
