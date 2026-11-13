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

function fetchHarness() {
  const listeners = new Map<string, (event: unknown) => void>();
  const self = {
    addEventListener(type: string, listener: (event: unknown) => void) {
      listeners.set(type, listener);
    },
    location: { origin: "http://localhost:3000" },
  };
  const caches = {
    match: async () => undefined,
    open: async () => ({ put: async () => undefined }),
  };
  const fetch = async () => ({ ok: true, clone: () => ({}) });
  const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
  runInNewContext(source, { self, URL, caches, fetch });
  return {
    answersFromWorker(path: string, mode: RequestMode = "cors", method = "GET") {
      let answered = false;
      listeners.get("fetch")?.({
        request: { url: `http://localhost:3000${path}`, mode, method },
        respondWith: () => {
          answered = true;
        },
      });
      return answered;
    },
  };
}

describe("service-worker fetch rules", () => {
  it("never answers page data from its cache, so a refresh after a save shows the saved data", () => {
    const worker = fetchHarness();
    expect(worker.answersFromWorker("/projects/2/notes/160?_rsc=eupc6SzmXXU6Nh0h")).toBe(false);
    expect(worker.answersFromWorker("/projects/2/notes")).toBe(false);
    expect(worker.answersFromWorker("/api/files/7")).toBe(false);
    expect(worker.answersFromWorker("/projects/2/notes/160", "cors", "POST")).toBe(false);
  });

  it("serves static files and keeps the offline page shell", () => {
    const worker = fetchHarness();
    expect(worker.answersFromWorker("/_next/static/chunks/app.js")).toBe(true);
    expect(worker.answersFromWorker("/icons/icon-192x192.png")).toBe(true);
    expect(worker.answersFromWorker("/favicon.ico")).toBe(true);
    expect(worker.answersFromWorker("/projects/2/notes", "navigate")).toBe(true);
  });
});
