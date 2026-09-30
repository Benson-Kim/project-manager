import { z } from "zod";

const pushConfigSchema = z.object({
  publicKey: z.string().min(1),
  privateKey: z.string().min(1),
  subject: z.union([z.string().url(), z.string().regex(/^mailto:.+@.+$/)]),
  dispatchToken: z.string().min(32),
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
