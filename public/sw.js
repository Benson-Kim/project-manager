// Service Worker — PWA offline shell + event-driven todo alerts.
//
// Lifecycle:
//   install   → precache the app shell (navigation skeleton + static assets)
//               so the application loads from cache when the network is absent,
//               then skipWaiting() so the new worker activates immediately.
//   activate  → delete stale caches from previous versions, then claim all
//               clients so the fresh worker controls existing tabs.
//   fetch     → navigation requests: network-first with cache fallback so users
//               always see fresh data when online; cached skeleton when offline.
//               Static assets (JS/CSS/images): cache-first (content-hashed names
//               mean a new file name on every deploy).
//   push      → wake this worker for each due alert and show an OS notification.
//               Browsers may stop an idle worker at any time; each push event
//               is independent and handled by a fresh instance.
//   notificationclick → open or focus /todo.

// ── Cache versioning ──────────────────────────────────────────────────────────
//
// Bump CACHE_VERSION on every deploy that changes the app-shell skeleton or
// precache list.  The activate handler deletes all caches whose name does not
// match SHELL_CACHE, so old entries are cleaned up automatically.
//
// Bump policy:
//   • Content-hashed JS/CSS never need a bump (new filenames bust themselves).
//   • Bump when / (the nav skeleton) or /favicon.ico changes visually.
//   • Bump when adding or removing a URL from PRECACHE_URLS.
//   • Use a short date stamp or incrementing integer, e.g. "v2", "v3", "2026-10".
//   • After bumping, `skipWaiting()` in the install handler activates the new
//     worker immediately; existing tabs call `clients.claim()` and switch over.
const CACHE_VERSION = "v1";
const SHELL_CACHE = `shell-${CACHE_VERSION}`;

// App-shell assets to precache.  Next.js content-hashes JS/CSS filenames so
// stale entries are never served for those; the navigation fallback ("/") is
// the only entry whose content can silently become stale — it is re-fetched
// network-first on every navigation when online.
const PRECACHE_URLS = ["/", "/favicon.ico", "/manifest.webmanifest"];

// ─── Install ─────────────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ─── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only intercept GET requests on our own origin.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API routes and internal routes are never cached — always pass through.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) {
    // For _next/static assets (content-hashed), use cache-first so repeat
    // visits are instant.  For everything else (_next/data, etc.) skip.
    if (url.pathname.startsWith("/_next/static/")) {
      event.respondWith(
        caches.match(request).then(
          (cached) => cached || fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          }),
        ),
      );
    }
    return;
  }

  // Navigation requests (HTML): network-first, fall back to cached "/" shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/"))),
    );
    return;
  }

  // All other same-origin GETs (images, icons, manifest): cache-first.
  event.respondWith(
    caches.match(request).then(
      (cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      }),
    ),
  );
});

// ─── Push ─────────────────────────────────────────────────────────────────────

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

self.addEventListener("push", (event) => {
  // waitUntil keeps this one event alive until its notification is shown. A
  // later push gets a new worker instance, which is the supported lifecycle.
  event.waitUntil(showAlerts(alertsFromPayload(readPushPayload(event))));
});

// ─── Notification click ───────────────────────────────────────────────────────

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
