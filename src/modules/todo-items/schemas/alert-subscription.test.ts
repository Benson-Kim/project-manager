import { describe, expect, it } from "vitest";
import { pushSubscriptionInput } from "./alert-subscription";

const validSubscription = {
  endpoint: "https://push.example.test/send/abc",
  expirationTime: null,
  keys: { p256dh: "BAbc_123", auth: "xyz-456" },
};

describe("push subscription boundary", () => {
  it("accepts the browser PushSubscription JSON shape", () => {
    expect(pushSubscriptionInput.parse(validSubscription)).toEqual(validSubscription);
  });

  it.each([
    ["invalid endpoint", { ...validSubscription, endpoint: "not-a-url" }],
    ["missing encryption keys", { endpoint: validSubscription.endpoint, keys: {} }],
    ["unexpected field", { ...validSubscription, extra: "must be rejected" }],
  ])("rejects %s", (_label, value) => {
    expect(pushSubscriptionInput.safeParse(value).success).toBe(false);
  });
});
