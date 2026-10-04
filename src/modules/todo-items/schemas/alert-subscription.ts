import { z } from "zod";

const MAX_SQL_DATETIME2_MS = 253402300799999; // 9999-12-31T23:59:59.999Z

/**
 * Push service endpoint hostnames produced by supported browsers.
 *
 * Chrome/Edge/Opera — Firebase Cloud Messaging (FCM):
 *   https://fcm.googleapis.com/fcm/send/...
 *   https://fcm.googleapis.com/wp/...
 * Firefox — Mozilla Push Service:
 *   https://updates.push.services.mozilla.com/wpush/...
 *   https://push.services.mozilla.com/wpush/...
 * Safari / WebKit — Apple Push:
 *   https://web.push.apple.com/...
 *
 * Allowlisting by hostname prevents authenticated callers from registering
 * arbitrary HTTPS URLs and weaponising the scheduler's outbound HTTP request
 * (SSRF).  The list is updated when a new major browser ships a different push
 * service; it is intentionally strict — unknown endpoints are rejected rather
 * than trusted.
 */
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
] as const;

function isPushServiceHost(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") return false;
    return PUSH_SERVICE_HOSTS.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

const pushEndpoint = z
  .string()
  .url()
  .max(2048)
  .refine(isPushServiceHost, "endpoint must be a known push service");

const base64UrlKey = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_-]+$/, "must be base64url encoded");

/** JSON shape produced by PushSubscription.toJSON(). */
export const pushSubscriptionInput = z
  .object({
    endpoint: pushEndpoint,
    expirationTime: z.number().int().nonnegative().max(MAX_SQL_DATETIME2_MS).nullable().optional(),
    keys: z
      .object({
        p256dh: base64UrlKey,
        auth: base64UrlKey,
      })
      .strict(),
  })
  .strict();

export type PushSubscriptionInput = z.input<typeof pushSubscriptionInput>;

export const pushDeliveryRowSchema = z.object({
  AlertSubscriptionId: z.number().int().positive(),
  UserId: z.number().int().positive(),
  Endpoint: pushEndpoint,
  P256dh: base64UrlKey,
  Auth: base64UrlKey,
  ExpirationTimeUtc: z.date().nullable(),
  TodoAlertId: z.number().int().positive(),
  TodoItemId: z.number().int().positive(),
  TodoItem: z.string().nullable(),
});

export type PushDeliveryRow = z.infer<typeof pushDeliveryRowSchema>;
