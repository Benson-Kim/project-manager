import { describe, expect, it, vi } from "vitest";
import { oneAtATime } from "../canvas/one-at-a-time";

describe("oneAtATime", () => {
  it("drops a second call while the first is running, so a double Remove link sends one request", async () => {
    const run = oneAtATime();
    let finish = () => {};
    const task = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const first = run("Requirement:1>Requirement:2", task);
    await run("Requirement:1>Requirement:2", task);
    finish();
    await first;

    expect(task).toHaveBeenCalledTimes(1);
  });

  it("runs different links side by side", async () => {
    const run = oneAtATime();
    const task = vi.fn(() => Promise.resolve());

    await Promise.all([run("Wbs:1>Requirement:2", task), run("Wbs:1>Requirement:3", task)]);

    expect(task).toHaveBeenCalledTimes(2);
  });

  it("frees the link once its request settles, so it can be sent again", async () => {
    const run = oneAtATime();
    const task = vi.fn(() => Promise.resolve());

    await run("Wbs:1>Requirement:2", task);
    await run("Wbs:1>Requirement:2", task);

    expect(task).toHaveBeenCalledTimes(2);
  });

  it("frees the link when its request fails, so a retry is not blocked", async () => {
    const run = oneAtATime();

    await expect(
      run("Wbs:1>Requirement:2", () => Promise.reject(new Error("offline"))),
    ).rejects.toThrow("offline");
    const retry = vi.fn(() => Promise.resolve());
    await run("Wbs:1>Requirement:2", retry);

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
