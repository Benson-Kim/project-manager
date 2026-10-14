/**
 * Runs backups and restores one at a time, in the order they were asked for.
 * `current()` is the tail of the queue (or null when idle): it never rejects,
 * so quitting or updating can wait on it, and a task that finished early never
 * clears the lock of one queued behind it.
 */
export interface Exclusive {
  run<T>(task: () => Promise<T>): Promise<T>;
  current(): Promise<void> | null;
}

export function createExclusive(): Exclusive {
  let tail: Promise<void> | null = null;
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = (tail ?? Promise.resolve()).then(task);
      const settled: Promise<void> = result.then(
        () => undefined,
        () => undefined,
      );
      tail = settled;
      void settled.then(() => {
        if (tail === settled) tail = null;
      });
      return result;
    },
    current: () => tail,
  };
}
