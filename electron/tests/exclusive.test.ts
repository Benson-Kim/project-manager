import { describe, expect, it } from "vitest";
import { createExclusive } from "../exclusive";

function deferred() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createExclusive", () => {
  it("is idle until a task runs, and idle again after it", async () => {
    const lock = createExclusive();
    expect(lock.current()).toBeNull();
    await lock.run(async () => "done");
    await tick();
    expect(lock.current()).toBeNull();
  });

  it("starts a second task only after the first one finished", async () => {
    const lock = createExclusive();
    const first = deferred();
    const order: string[] = [];
    const a = lock.run(async () => {
      order.push("a start");
      await first.promise;
      order.push("a end");
    });
    const b = lock.run(async () => {
      order.push("b");
    });
    await tick();
    expect(order).toEqual(["a start"]);
    first.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(["a start", "a end", "b"]);
  });

  it("keeps the lock while a queued restore runs, after the task before it finished", async () => {
    const lock = createExclusive();
    const backup = deferred();
    const restore = deferred();
    void lock.run(() => backup.promise);
    const second = lock.run(() => restore.promise);
    backup.resolve();
    await tick();
    await tick();
    expect(lock.current()).not.toBeNull();
    restore.resolve();
    await second;
    await tick();
    expect(lock.current()).toBeNull();
  });

  it("runs the next task even when the one before it failed, and reports each result to its caller", async () => {
    const lock = createExclusive();
    const failing = lock.run(async () => {
      throw new Error("backup failed");
    });
    const next = lock.run(async () => "restored");
    await expect(failing).rejects.toThrow("backup failed");
    await expect(next).resolves.toBe("restored");
  });

  it("current() never rejects, so quitting can wait on it", async () => {
    const lock = createExclusive();
    void lock
      .run(async () => {
        throw new Error("boom");
      })
      .catch(() => undefined);
    await expect(lock.current()).resolves.toBeUndefined();
  });
});
