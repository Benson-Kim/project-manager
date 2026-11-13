/** How many changes an editor can take back, newest first. */
export const UNDO_LIMIT = 30;

/** A step back carries the key a refused change forgets it by. */
export type Keyed = { key: number };

export function pushStep<T extends Keyed>(stack: readonly T[], step: T | null): T[] {
  return step ? [...stack, step].slice(-UNDO_LIMIT) : [...stack];
}

/** Forgets a step whose change the server refused: there is nothing to take back. */
export function dropStep<T extends Keyed>(stack: readonly T[], key: number): T[] {
  return stack.filter((step) => step.key !== key);
}

/** The newest step that still applies, and the steps left under it; ones that no longer apply go. */
export function takeStep<T>(
  stack: readonly T[],
  applies: (step: T) => boolean,
): { step: T | null; rest: T[] } {
  const rest = [...stack];
  while (rest.length > 0) {
    const step = rest.pop()!;
    if (applies(step)) return { step, rest };
  }
  return { step: null, rest };
}
