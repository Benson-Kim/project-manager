import type { CanvasItem } from "../schemas/canvas";

const comparable = (title: string) => title.trim().replace(/\s+/g, " ").toLocaleLowerCase();

/** The project items whose title matches, ignoring case and spacing; the form warns on any. */
export function titleMatches<T extends Pick<CanvasItem, "Title">>(
  title: string,
  items: readonly T[],
): T[] {
  const wanted = comparable(title);
  if (!wanted) return [];
  return items.filter((item) => comparable(item.Title) === wanted);
}
