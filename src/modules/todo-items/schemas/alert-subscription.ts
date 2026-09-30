import { z } from "zod";

const MAX_SQL_DATETIME2_MS = 253402300799999; // 9999-12-31T23:59:59.999Z

const pushEndpoint = z
  .string()
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === "https:", "must use HTTPS");

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
