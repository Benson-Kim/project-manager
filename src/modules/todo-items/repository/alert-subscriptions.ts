import { execProc } from "@/lib/db";
import {
  pushDeliveryRowSchema,
  pushSubscriptionInput,
  type PushDeliveryRow,
  type PushSubscriptionInput,
} from "../schemas/alert-subscription";

export async function upsertAlertSubscription(
  input: PushSubscriptionInput,
  actorUserId: number,
): Promise<void> {
  const parsed = pushSubscriptionInput.parse(input);
  await execProc("usp_AlertSubscription_Upsert", {
    Endpoint: parsed.endpoint,
    P256dh: parsed.keys.p256dh,
    Auth: parsed.keys.auth,
    ExpirationTimeUtc: parsed.expirationTime ? new Date(parsed.expirationTime) : null,
    ActorUserId: actorUserId,
  });
}

export async function listDuePushDeliveries(): Promise<PushDeliveryRow[]> {
  const rows = await execProc<PushDeliveryRow>("usp_TodoAlert_ListPushDeliveries");
  return rows.map((row) => pushDeliveryRowSchema.parse(row));
}

export async function deactivateAlertSubscription(alertSubscriptionId: number): Promise<void> {
  await execProc("usp_AlertSubscription_Deactivate", {
    AlertSubscriptionId: alertSubscriptionId,
    ActorUserId: 0,
  });
}

/**
 * Stamp LastPushSentAtUtc on a subscription row after a successful Web Push
 * send.  This advances the row past the delivery-list filter so subsequent
 * same-day scheduler invocations skip it, preventing starvation of later rows.
 */
export async function recordAlertSubscriptionDelivery(alertSubscriptionId: number): Promise<void> {
  await execProc("usp_AlertSubscription_RecordDelivery", {
    AlertSubscriptionId: alertSubscriptionId,
    ActorUserId: 0,
  });
}

/**
 * Retire all active push subscriptions for a user.  Called on logout and on
 * password change so a signed-out shared browser immediately stops receiving
 * that user's to-do notifications.
 */
export async function deactivateAlertSubscriptionsByUser(
  userId: number,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_AlertSubscription_DeactivateByUser", {
    UserId: userId,
    ActorUserId: actorUserId,
  });
}
