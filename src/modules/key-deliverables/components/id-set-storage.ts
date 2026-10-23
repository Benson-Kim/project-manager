/** A set of item ids kept in this browser (collapsed branches, folded requirements). */
export function readIdSet(key: string): Set<number> | null {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => Number.isInteger(v))) : null;
  } catch {
    return null;
  }
}

export function writeIdSet(key: string, ids: ReadonlySet<number>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Private windows and blocked storage: the view just forgets.
  }
}
