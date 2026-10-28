import type { RichCellView } from "@/components/ui/data-view/datasheet";
import { RichTextView } from "./rich-text-view";

export type WithRichViews<Row, Key extends keyof Row> = Row & { views: Record<Key, RichCellView> };

/**
 * List rows with their rich-text fields rendered for the cell (ADR-0025). Server only: the
 * sanitiser lives here, never in the browser.
 */
export function withRichViews<Row, Key extends keyof Row & string>(
  rows: Row[],
  keys: readonly Key[],
): WithRichViews<Row, Key>[] {
  return rows.map((row) => {
    const views = {} as Record<Key, RichCellView>;
    for (const key of keys) {
      const html = row[key] as string | null;
      views[key] = { html, node: <RichTextView html={html} /> };
    }
    return { ...row, views };
  });
}
