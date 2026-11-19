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

export interface DuePushDeliveries {
  deliveries: PushDeliveryRow[];
  skipped: number;
}

export async function listDuePushDeliveries(localNow: Date): Promise<DuePushDeliveries> {
  const rows = await execProc<PushDeliveryRow>("usp_TodoAlert_ListPushDeliveries", {
    LocalNow: localNow,
  });
  const deliveries: PushDeliveryRow[] = [];
  let skipped = 0;
  for (const row of rows) {
    const parsed = pushDeliveryRowSchema.safeParse(row);
    if (parsed.success) {
      deliveries.push(parsed.data);
    } else {
      skipped += 1;
      console.warn("[alerts] skipped a malformed subscription row:", {
        alertSubscriptionId: (row as { AlertSubscriptionId?: unknown }).AlertSubscriptionId,
        todoAlertId: (row as { TodoAlertId?: unknown }).TodoAlertId,
      });
    }
  }
  return { deliveries, skipped };
}

export async function deactivateAlertSubscription(alertSubscriptionId: number): Promise<void> {
  await execProc("usp_AlertSubscription_Deactivate", {
    AlertSubscriptionId: alertSubscriptionId,
    ActorUserId: 0,
  });
}

/**
 * Record a successful Web Push of one alert to one subscription for a local day, so later
 * same-day scheduler invocations skip it while other alerts due that day are still sent.
 */
export async function recordAlertSubscriptionDelivery(
  alertSubscriptionId: number,
  todoAlertId: number,
  alertDate: Date,
): Promise<void> {
  await execProc("usp_AlertSubscription_RecordDelivery", {
    AlertSubscriptionId: alertSubscriptionId,
    TodoAlertId: todoAlertId,
    AlertDate: alertDate,
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
