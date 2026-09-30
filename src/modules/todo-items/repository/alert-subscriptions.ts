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
