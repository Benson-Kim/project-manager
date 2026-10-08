/**
 * Unit tests for the /api/internal/todo-alerts/dispatch route handler.
 *
 * Covers:
 *  - hasDispatchToken — correct/missing/short tokens
 *  - dispatchOne — sent, failed, retired (expired 404/410) paths
 *  - POST batch loop — counter accumulation across a multi-batch payload
 *  - POST guards — 503 when unconfigured, 401 when token mismatch
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PushDeliveryRow } from "@/modules/todo-items/schemas/alert-subscription";

// ── Mock push config ──────────────────────────────────────────────────────────
const VALID_TOKEN = "a".repeat(32);
let pushConfigured = true;
vi.mock("@/lib/push/config", () => ({
  getPushConfig: () =>
    pushConfigured
      ? {
          publicKey: "pub",
          privateKey: "priv",
          subject: "mailto:test@example.com",
          dispatchToken: VALID_TOKEN,
        }
      : null,
}));

// ── Mock repository ───────────────────────────────────────────────────────────
const listDuePushDeliveries = vi.fn();
const deactivateAlertSubscription = vi.fn();
const recordAlertSubscriptionDelivery = vi.fn();
vi.mock("@/modules/todo-items/repository/alert-subscriptions", () => ({
  listDuePushDeliveries: (...args: unknown[]) => listDuePushDeliveries(...args),
  deactivateAlertSubscription: (...args: unknown[]) => deactivateAlertSubscription(...args),
  recordAlertSubscriptionDelivery: (...args: unknown[]) => recordAlertSubscriptionDelivery(...args),
}));

// ── Mock sender ───────────────────────────────────────────────────────────────
const sendTodoAlertPush = vi.fn();
const isExpiredPushSubscription = vi.fn();
vi.mock("@/lib/push/sender", () => ({
  sendTodoAlertPush: (...args: unknown[]) => sendTodoAlertPush(...args),
  isExpiredPushSubscription: (...args: unknown[]) => isExpiredPushSubscription(...args),
}));

// ── Import under test (after mocks are registered) ───────────────────────────
import { POST } from "../route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDelivery(id: number): PushDeliveryRow {
  return {
    AlertSubscriptionId: id,
    UserId: 1,
    Endpoint: "https://fcm.googleapis.com/fcm/send/test",
    P256dh: "AAAA",
    Auth: "BBBB",
    ExpirationTimeUtc: null,
    TodoAlertId: id * 10,
    TodoItemId: id * 100,
    TodoItem: `Task ${id}`,
  };
}

function makeRequest(token: string): Request {
  return new Request("http://localhost/api/internal/todo-alerts/dispatch", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("POST /api/internal/todo-alerts/dispatch", () => {
  beforeEach(() => {
    pushConfigured = true;
    vi.clearAllMocks();
    recordAlertSubscriptionDelivery.mockResolvedValue(undefined);
    deactivateAlertSubscription.mockResolvedValue(undefined);
    isExpiredPushSubscription.mockReturnValue(false);
  });

  // ── Configuration guard ──────────────────────────────────────────────────

  it("returns 503 when push is not configured", async () => {
    pushConfigured = false;
    const res = await POST(makeRequest(VALID_TOKEN));
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toMatch(/not configured/i);
  });

  // ── Auth guard ───────────────────────────────────────────────────────────

  it("returns 401 for a missing Authorization header", async () => {
    listDuePushDeliveries.mockResolvedValue([]);
    const req = new Request("http://localhost/api/internal/todo-alerts/dispatch", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 for a wrong token", async () => {
    listDuePushDeliveries.mockResolvedValue([]);
    const res = await POST(makeRequest("b".repeat(32)));
    expect(res.status).toBe(401);
  });

  it("returns 401 for a token that is the right length but differs", async () => {
    // Ensures timingSafeEqual comparison is exercised, not just length check.
    const almostRight = VALID_TOKEN.slice(0, -1) + "Z";
    const res = await POST(makeRequest(almostRight));
    expect(res.status).toBe(401);
  });

  // ── Empty queue ──────────────────────────────────────────────────────────

  it("returns 200 with zero counters when there are no deliveries", async () => {
    listDuePushDeliveries.mockResolvedValue([]);
    const res = await POST(makeRequest(VALID_TOKEN));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ attempted: 0, sent: 0, failed: 0, retired: 0 });
    expect(sendTodoAlertPush).not.toHaveBeenCalled();
  });

  // ── dispatchOne paths ────────────────────────────────────────────────────

  it("counts a successful send and stamps delivery", async () => {
    listDuePushDeliveries.mockResolvedValue([makeDelivery(1)]);
    sendTodoAlertPush.mockResolvedValue(undefined);
    const res = await POST(makeRequest(VALID_TOKEN));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ attempted: 1, sent: 1, failed: 0, retired: 0 });
    expect(recordAlertSubscriptionDelivery).toHaveBeenCalledWith(1);
    expect(deactivateAlertSubscription).not.toHaveBeenCalled();
  });

  it("counts an expired subscription (404) as retired, not failed", async () => {
    listDuePushDeliveries.mockResolvedValue([makeDelivery(2)]);
    const expiredErr = { statusCode: 404, body: "gone" };
    sendTodoAlertPush.mockRejectedValue(expiredErr);
    isExpiredPushSubscription.mockReturnValue(true);
    const res = await POST(makeRequest(VALID_TOKEN));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ attempted: 1, sent: 0, failed: 0, retired: 1 });
    expect(deactivateAlertSubscription).toHaveBeenCalledWith(2);
    expect(recordAlertSubscriptionDelivery).not.toHaveBeenCalled();
  });

  it("counts a non-expired push error as failed", async () => {
    listDuePushDeliveries.mockResolvedValue([makeDelivery(3)]);
    sendTodoAlertPush.mockRejectedValue({ statusCode: 500 });
    isExpiredPushSubscription.mockReturnValue(false);
    const res = await POST(makeRequest(VALID_TOKEN));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ attempted: 1, sent: 0, failed: 1, retired: 0 });
    expect(deactivateAlertSubscription).not.toHaveBeenCalled();
  });

  // ── Batch loop accumulation ───────────────────────────────────────────────

  it("accumulates counters correctly across multiple batches (> DISPATCH_CONCURRENCY)", async () => {
    // 10 deliveries: first 8 succeed, next 2 — one expires (retired), one fails.
    const deliveries = Array.from({ length: 10 }, (_, i) => makeDelivery(i + 1));
    listDuePushDeliveries.mockResolvedValue(deliveries);

    sendTodoAlertPush.mockImplementation(async (d: ReturnType<typeof makeDelivery>) => {
      const id = d.AlertSubscriptionId;
      if (id === 9) throw { statusCode: 410 }; // expired
      if (id === 10) throw { statusCode: 429 }; // rate-limited / failed
    });
    isExpiredPushSubscription.mockImplementation(
      (err: unknown) => (err as { statusCode?: number }).statusCode === 410,
    );

    const res = await POST(makeRequest(VALID_TOKEN));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ attempted: 10, sent: 8, failed: 1, retired: 1 });
    // deactivate called only for the 410
    expect(deactivateAlertSubscription).toHaveBeenCalledOnce();
    expect(deactivateAlertSubscription).toHaveBeenCalledWith(9);
    // stamp called for the 8 successes
    expect(recordAlertSubscriptionDelivery).toHaveBeenCalledTimes(8);
  });
});
