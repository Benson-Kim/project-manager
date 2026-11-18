import { beforeEach, describe, expect, it, vi } from "vitest";

const execProc = vi.fn();
vi.mock("@/lib/db", () => ({ execProc: (...args: unknown[]) => execProc(...args) }));

import { listDuePushDeliveries } from "../repository/alert-subscriptions";

const row = (id: number, endpoint = "https://fcm.googleapis.com/fcm/send/abc") => ({
  AlertSubscriptionId: id,
  UserId: 1,
  Endpoint: endpoint,
  P256dh: "AAAA",
  Auth: "BBBB",
  ExpirationTimeUtc: null,
  TodoAlertId: id,
  TodoItemId: id,
  TodoItem: "Task",
  AlertDate: new Date("2026-11-18T00:00:00Z"),
});

describe("listDuePushDeliveries", () => {
  beforeEach(() => {
    execProc.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("passes the wall clock to the proc", async () => {
    execProc.mockResolvedValue([]);
    const now = new Date("2026-11-18T00:30:00Z");
    await listDuePushDeliveries(now);
    expect(execProc).toHaveBeenCalledWith("usp_TodoAlert_ListPushDeliveries", { LocalNow: now });
  });

  it("keeps the valid rows and counts a malformed one as skipped", async () => {
    execProc.mockResolvedValue([row(1), row(2, "https://example.com/not-a-push-service"), row(3)]);
    const result = await listDuePushDeliveries(new Date());
    expect(result.deliveries.map((d) => d.AlertSubscriptionId)).toEqual([1, 3]);
    expect(result.skipped).toBe(1);
  });
});
