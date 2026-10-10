import { z } from "zod";

/** Sentinel value that shipped in .env.example prior to 2026-09 — reject it
 *  so an operator who copies the example file cannot accidentally enable the
 *  dispatch endpoint with a publicly known bearer token. */
const DISPATCH_TOKEN_SENTINEL = "replace-with-at-least-32-random-characters";

const pushConfigSchema = z.object({
  publicKey: z.string().min(1),
  privateKey: z.string().min(1),
  subject: z.union([z.string().url(), z.string().regex(/^mailto:.+@.+$/)]),
  dispatchToken: z
    .string()
    .min(32)
    .refine(
      (v) => v !== DISPATCH_TOKEN_SENTINEL,
      "ALERT_PUSH_DISPATCH_TOKEN must be replaced with a random secret",
    ),
});

export type PushConfig = z.infer<typeof pushConfigSchema>;

/** Server-only VAPID configuration. Missing values disable dispatch cleanly. */
export function getPushConfig(): PushConfig | null {
  const result = pushConfigSchema.safeParse({
    publicKey: process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY,
    privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
    subject: process.env.WEB_PUSH_VAPID_SUBJECT,
    dispatchToken: process.env.ALERT_PUSH_DISPATCH_TOKEN,
  });
  return result.success ? result.data : null;
}
