/** A label that does not contain the typed text at all. */
export const NO_MATCH = 4;

/** How well a label matches typed text: 0 the whole label, 1 its start, 2 a word's start, 3 inside it. */
export function matchRank(label: string, query: string): number {
  const text = label.toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  if (text === q) return 0;
  if (text.startsWith(q)) return 1;
  const at = text.indexOf(q);
  if (at < 0) return NO_MATCH;
  return /[\s\-_/.,(]/.test(text[at - 1]) ? 2 : 3;
}

/**
 * Every option, best matches first (client feedback, 2026-10-28): typing reorders the list
 * instead of emptying it, so an option spelled differently is still there to pick. Options that
 * match equally keep their order.
 */
export function rankByMatch<T>(
  options: readonly T[],
  query: string,
  labelOf: (option: T) => string,
): { option: T; rank: number }[] {
  return options
    .map((option, index) => ({ option, rank: matchRank(labelOf(option), query), index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ option, rank }) => ({ option, rank }));
}
