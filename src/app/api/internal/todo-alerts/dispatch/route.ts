import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  deactivateAlertSubscription,
  listDuePushDeliveries,
  recordAlertSubscriptionDelivery,
} from "@/modules/todo-items/repository/alert-subscriptions";
import { getPushConfig } from "@/lib/push/config";
import { isExpiredPushSubscription, sendTodoAlertPush } from "@/lib/push/sender";

export const runtime = "nodejs";

function hasDispatchToken(request: Request, expected: string): boolean {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice("Bearer ".length));
  const target = Buffer.from(expected);
  return supplied.length === target.length && timingSafeEqual(supplied, target);
}

/**
 * Maximum number of push requests in-flight at once. High enough to overlap
 * network latency across push services; low enough not to exhaust the Node.js
 * connection pool or trigger push-service rate limits.
 */
const DISPATCH_CONCURRENCY = 8;

/**
 * Send one delivery and update the running counters. Returns the three deltas
 * so the pool loop can accumulate them without shared mutable state inside the
 * concurrent tasks.
 */
async function dispatchOne(
  delivery: Awaited<ReturnType<typeof listDuePushDeliveries>>[number],
): Promise<{ sent: number; failed: number; retired: number }> {
  try {
    await sendTodoAlertPush(delivery);
    // Stamp LastPushSentAtUtc so the next same-day scheduler invocation
    // skips this subscription.  Best-effort: a failure here must not
    // suppress the sent count or prevent other deliveries.
    await recordAlertSubscriptionDelivery(delivery.AlertSubscriptionId).catch((err) => {
      console.warn("[alerts] recordDelivery failed:", { alertSubscriptionId: delivery.AlertSubscriptionId, err });
    });
    return { sent: 1, failed: 0, retired: 0 };
  } catch (error) {
    if (isExpiredPushSubscription(error)) {
      await deactivateAlertSubscription(delivery.AlertSubscriptionId);
      return { sent: 0, failed: 0, retired: 1 };
    }
    const statusCode = error && typeof error === "object" && "statusCode" in error
      ? (error as { statusCode?: unknown }).statusCode
      : "unknown";
    console.error("[alerts] push send failed:", { statusCode, alertSubscriptionId: delivery.AlertSubscriptionId });
    return { sent: 0, failed: 1, retired: 0 };
  }
}

/**
 * Called by a trusted scheduler once per minute. It is intentionally separate
 * from user-facing auth: the bearer token is a server-only secret and the
 * route is the wake-up for the event-driven Web Push sender.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const config = getPushConfig();
  if (!config) return NextResponse.json({ error: "Push dispatch is not configured" }, { status: 503 });
  if (!hasDispatchToken(request, config.dispatchToken)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deliveries = await listDuePushDeliveries();
  let sent = 0;
  let failed = 0;
  let retired = 0;

  // Process deliveries in fixed-size concurrent batches. Each batch of up to
  // DISPATCH_CONCURRENCY tasks runs in parallel; the next batch starts only
  // after all tasks in the current batch settle. This keeps the number of
  // simultaneous outbound connections bounded while still overlapping latency.
  for (let i = 0; i < deliveries.length; i += DISPATCH_CONCURRENCY) {
    const results = await Promise.all(
      deliveries.slice(i, i + DISPATCH_CONCURRENCY).map(dispatchOne),
    );
    for (const r of results) {
      sent += r.sent;
      failed += r.failed;
      retired += r.retired;
    }
  }

  return NextResponse.json({ attempted: deliveries.length, sent, failed, retired });
}
