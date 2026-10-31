import type { NoteSectionRow, NoteTabRow } from "./schemas/note";

export interface PageGroup {
  section: NoteSectionRow | null;
  pages: NoteTabRow[];
}

/**
 * A notebook's pages by tab, in tab order and page order (ADR-0053). A notebook
 * without tabs is one group with no section, so the workspace and the print
 * page walk both shapes the same way.
 */
export function groupPages(sections: NoteSectionRow[], pages: NoteTabRow[]): PageGroup[] {
  if (sections.length === 0) return [{ section: null, pages }];
  return sections.map((section) => ({
    section,
    pages: pages.filter((page) => page.NoteSectionId === section.NoteSectionId),
  }));
}

/** The order with the entries for ids a and b swapped; every other entry keeps its place. */
export function swapInOrder<T extends { id: number }>(order: T[], a: number, b: number): T[] {
  const next = [...order];
  const i = next.findIndex((entry) => entry.id === a);
  const j = next.findIndex((entry) => entry.id === b);
  if (i < 0 || j < 0) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** The tab a strip key moves to: arrows wrap, Home and End jump; null for any other key. */
export function stripKeyTarget(key: string, index: number, length: number): number | null {
  if (length === 0) return null;
  if (key === "ArrowRight") return (index + 1) % length;
  if (key === "ArrowLeft") return (index - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}
