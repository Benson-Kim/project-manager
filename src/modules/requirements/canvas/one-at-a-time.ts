/** Runs one task per key at a time. A call for a key that is still running is dropped (undefined). */
export function oneAtATime() {
  const running = new Set<string>();
  return async <T>(key: string, task: () => Promise<T>): Promise<T | undefined> => {
    if (running.has(key)) return undefined;
    running.add(key);
    try {
      return await task();
    } finally {
      running.delete(key);
    }
  };
}
