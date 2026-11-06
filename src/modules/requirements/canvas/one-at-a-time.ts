/** Runs one task per key at a time. A call for a key that is still running is dropped. */
export function oneAtATime() {
  const running = new Set<string>();
  return async (key: string, task: () => Promise<void>): Promise<void> => {
    if (running.has(key)) return;
    running.add(key);
    try {
      await task();
    } finally {
      running.delete(key);
    }
  };
}
