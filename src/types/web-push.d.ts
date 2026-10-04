declare module "web-push" {
  interface PushSubscription {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
  }

  interface SendNotificationOptions {
    TTL?: number;
    urgency?: "very-low" | "low" | "normal" | "high";
  }

  interface WebPushClient {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(
      subscription: PushSubscription,
      payload?: string,
      options?: SendNotificationOptions,
    ): Promise<{ statusCode: number; headers: Record<string, string>; body: string }>;
  }

  const webpush: WebPushClient;
  export = webpush;
}
