/** Rows grouped by key, groups in the order each key first appears, rows kept in their order. */
export function groupInOrder<T, K>(
  rows: readonly T[],
  keyOf: (row: T) => K,
): { key: K; rows: T[] }[] {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups].map(([key, grouped]) => ({ key, rows: grouped }));
}
