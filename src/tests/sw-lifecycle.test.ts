import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type WorkerHarness = {
  dispatch: (type: string, event: Record<string, unknown>) => Promise<void>;
  notifications: Array<[string, NotificationOptions]>;
};

type WorkerEvent = {
  waitUntil: (promise: Promise<unknown>) => void;
  data?: { json: () => unknown };
  notification?: { close: () => void; data?: { url?: string } };
};

function workerHarness(): WorkerHarness {
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const notifications: Array<[string, NotificationOptions]> = [];
  const self = {
    addEventListener(type: string, listener: (event: WorkerEvent) => void) {
      listeners.set(type, listener);
    },
    skipWaiting() {},
    clients: {
      claim: async () => undefined,
      matchAll: async () => [],
      openWindow: async () => undefined,
    },
    registration: {
      showNotification: async (title: string, options: NotificationOptions) => {
        notifications.push([title, options]);
      },
    },
  };
  const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
  runInNewContext(source, { self });
  return {
    notifications,
    async dispatch(type, event) {
      const waits: Promise<unknown>[] = [];
      listeners.get(type)?.({
        ...event,
        waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      });
      await Promise.all(waits);
    },
  };
}

const pushEvent = (alert: { todoAlertId: number; title: string }) => ({
  data: { json: () => alert },
});

describe("todo alert service-worker lifecycle", () => {
  it("shows a pushed alert with no open tab", async () => {
    const worker = workerHarness();
    await worker.dispatch("push", pushEvent({ todoAlertId: 7, title: "Submit report" }));
    expect(worker.notifications).toHaveLength(1);
    expect(worker.notifications[0][1].tag).toBe("todo-alert-7");
  });

  it("delivers after the browser terminates and restarts the worker", async () => {
    const firstWorker = workerHarness();
    await firstWorker.dispatch("push", pushEvent({ todoAlertId: 8, title: "First alert" }));
    const restartedWorker = workerHarness();
    await restartedWorker.dispatch("push", pushEvent({ todoAlertId: 9, title: "After restart" }));
    expect(firstWorker.notifications).toHaveLength(1);
    expect(restartedWorker.notifications[0][0]).toBe("After restart");
  });
});
