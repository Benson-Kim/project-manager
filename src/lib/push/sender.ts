import webpush from "web-push";
import type { PushDeliveryRow } from "@/modules/todo-items/schemas/alert-subscription";
import { getPushConfig } from "./config";

let configuredFingerprint: string | undefined;

function getWebPushClient(): typeof webpush {
  const config = getPushConfig();
  if (!config) throw new Error("Web Push configuration is incomplete");
  const fingerprint = `${config.subject}\n${config.publicKey}\n${config.privateKey}`;
  if (configuredFingerprint !== fingerprint) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    configuredFingerprint = fingerprint;
  }
  return webpush;
}

export function isExpiredPushSubscription(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return false;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || statusCode === 410;
}

export async function sendTodoAlertPush(delivery: PushDeliveryRow): Promise<void> {
  const title = delivery.TodoItem || "To-do alert";
  await getWebPushClient().sendNotification(
    {
      endpoint: delivery.Endpoint,
      expirationTime: delivery.ExpirationTimeUtc?.getTime() ?? null,
      keys: { p256dh: delivery.P256dh, auth: delivery.Auth },
    },
    JSON.stringify({
      todoAlertId: delivery.TodoAlertId,
      todoItemId: delivery.TodoItemId,
      title,
      body: "Your to-do alert is due. Click to open.",
    }),
    { TTL: 3600, urgency: "normal" },
  );
}
