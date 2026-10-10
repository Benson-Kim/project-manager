import { describe, expect, it } from "vitest";
import { pushSubscriptionInput } from "../schemas/alert-subscription";

const FCM = "https://fcm.googleapis.com/fcm/send/abc123";
const MOZILLA = "https://updates.push.services.mozilla.com/wpush/v2/abc123";
const APPLE = "https://web.push.apple.com/QpQ3iFSQwh5abc";

const validSubscription = {
  endpoint: FCM,
  expirationTime: null,
  keys: { p256dh: "BAbc_123", auth: "xyz-456" },
};

describe("push subscription boundary", () => {
  it("accepts a Chrome/FCM endpoint", () => {
    expect(pushSubscriptionInput.parse(validSubscription)).toEqual(validSubscription);
  });

  it("accepts a Firefox/Mozilla endpoint", () => {
    expect(pushSubscriptionInput.parse({ ...validSubscription, endpoint: MOZILLA }).endpoint).toBe(
      MOZILLA,
    );
  });

  it("accepts an Apple push endpoint", () => {
    expect(pushSubscriptionInput.parse({ ...validSubscription, endpoint: APPLE }).endpoint).toBe(
      APPLE,
    );
  });

  it.each([
    ["invalid endpoint", { ...validSubscription, endpoint: "not-a-url" }],
    [
      "insecure endpoint",
      { ...validSubscription, endpoint: "http://fcm.googleapis.com/fcm/send/abc" },
    ],
    ["missing encryption keys", { endpoint: FCM, keys: {} }],
    ["unexpected field", { ...validSubscription, extra: "must be rejected" }],
    // SSRF: unknown HTTPS hosts must be rejected regardless of path or format
    [
      "unknown HTTPS host",
      { ...validSubscription, endpoint: "https://push.example.test/send/abc" },
    ],
    ["internal IP", { ...validSubscription, endpoint: "https://192.168.1.1/push" }],
    ["localhost HTTPS", { ...validSubscription, endpoint: "https://localhost/push/token" }],
    // Subdomain spoofing: a subdomain of a valid host is allowed,
    // but a hostname that merely contains the allowed string is not.
    [
      "subdomain-spoofed fcm",
      { ...validSubscription, endpoint: "https://evil.com.fcm.googleapis.com.attacker.com/x" },
    ],
    [
      "suffix-spoofed fcm",
      { ...validSubscription, endpoint: "https://malicious-fcm.googleapis.com.evil.com/x" },
    ],
  ])("rejects %s", (_label, value) => {
    expect(pushSubscriptionInput.safeParse(value).success).toBe(false);
  });
});
