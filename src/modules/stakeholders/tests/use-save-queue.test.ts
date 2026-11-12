import { describe, expect, it } from "vitest";

import type { ActionResult } from "@/lib/action";

import { createSaveQueue, type SaveError } from "../components/use-save-queue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function harness() {
  const counts: number[] = [];
  const refused: SaveError[] = [];
  const queue = createSaveQueue({
    onCount: (n) => counts.push(n),
    onRefused: (error) => refused.push(error),
  });
  return { counts, refused, queue };
}

const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
const conflict: ActionResult<number> = {
  ok: false,
  error: { code: "CONFLICT", message: "changed by someone else" },
};

describe("createSaveQueue", () => {
  it("sends one change at a time, in the order queued", async () => {
    const { queue, counts } = harness();
    const first = deferred<ActionResult<number>>();
    const order: string[] = [];
    queue.enqueue({
      send: () => {
        order.push("send 1");
        return first.promise;
      },
      done: () => order.push("done 1"),
    });
    queue.enqueue({
      send: async () => {
        order.push("send 2");
        return ok(2);
      },
      done: () => order.push("done 2"),
    });
    await Promise.resolve();
    expect(order).toEqual(["send 1"]);
    expect(counts).toEqual([1, 2]);
    first.resolve(ok(1));
    await queue.idle();
    expect(order).toEqual(["send 1", "done 1", "send 2", "done 2"]);
    expect(counts.at(-1)).toBe(0);
  });

  it("reports a refusal, calls failed, and still sends the next change", async () => {
    const { queue, refused } = harness();
    const seen: string[] = [];
    queue.enqueue({
      send: async () => conflict,
      done: () => seen.push("done 1"),
      failed: (error) => seen.push(`failed 1 ${error.code}`),
    });
    queue.enqueue({ send: async () => ok(2), done: (n) => seen.push(`done ${n}`) });
    await queue.idle();
    expect(refused.map((e) => e.code)).toEqual(["CONFLICT"]);
    expect(seen).toEqual(["failed 1 CONFLICT", "done 2"]);
  });

  it("turns a thrown send into an INTERNAL refusal and clears the count", async () => {
    const { queue, refused, counts } = harness();
    let failed = false;
    queue.enqueue({
      send: async () => {
        throw new Error("network");
      },
      failed: () => (failed = true),
    });
    await queue.idle();
    expect(refused.map((e) => e.code)).toEqual(["INTERNAL"]);
    expect(failed).toBe(true);
    expect(counts).toEqual([1, 0]);
  });

  it("keeps going when a done callback throws", async () => {
    const { queue, counts } = harness();
    let second = false;
    queue.enqueue({
      send: async () => ok(1),
      done: () => {
        throw new Error("render");
      },
    });
    queue.enqueue({ send: async () => ok(2), done: () => (second = true) });
    await queue.idle();
    expect(second).toBe(true);
    expect(counts.at(-1)).toBe(0);
  });
});
