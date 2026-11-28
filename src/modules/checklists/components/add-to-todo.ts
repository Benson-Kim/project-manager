import type { CalendarAddedItem } from "../schemas/checklist";

type Outcome = CalendarAddedItem["Outcome"];

/**
 * Splits the add's answer by what the server did with each item: put on the to-do list now, kept on
 * it from an earlier add (its to-do still open), or skipped for having neither a start nor a due date.
 */
export function splitAddOutcome<T extends Pick<CalendarAddedItem, "Outcome">>(items: readonly T[]) {
  const of = (outcome: Outcome) => items.filter((item) => item.Outcome === outcome);
  return { added: of("added"), already: of("already"), undated: of("undated") };
}

/** Up to three titles in quotes, then how many more. */
export function nameItems(items: readonly { Title: string }[], shown = 3): string {
  const titles = items.slice(0, shown).map((item) => `"${item.Title.trim() || "Untitled"}"`);
  const more = items.length - titles.length;
  return more > 0 ? `${titles.join(", ")} and ${more} more` : titles.join(", ");
}
