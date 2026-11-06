export type RowId = string | number;

/** How much of the rows on screen the selection covers, for the header box. */
export function selectAllState(selected: readonly RowId[], shownIds: readonly RowId[]) {
  const picked = shownIds.filter((id) => selected.includes(id)).length;
  if (picked === 0) return "none";
  return picked === shownIds.length ? "all" : "some";
}

/** Selects every row on screen, or clears them when all are already selected. */
export function toggleAll(selected: readonly RowId[], shownIds: readonly RowId[]): RowId[] {
  if (selectAllState(selected, shownIds) === "all") {
    return selected.filter((id) => !shownIds.includes(id));
  }
  return [...selected, ...shownIds.filter((id) => !selected.includes(id))];
}
