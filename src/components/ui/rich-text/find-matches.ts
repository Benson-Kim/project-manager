import type { Node as PMNode } from "@tiptap/pm/model";

export interface TextRun {
  text: string;
  pos: number;
}

export interface Match {
  from: number;
  to: number;
}

/** Adjacent text nodes (a word half bold) join into one run, so a search spans marks. */
export function textRuns(doc: Pick<PMNode, "descendants">): TextRun[] {
  const runs: TextRun[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const last = runs.at(-1);
    if (last && last.pos + last.text.length === pos) last.text += node.text;
    else runs.push({ text: node.text, pos });
  });
  return runs;
}

/** Case-insensitive, literal (no pattern characters), in document order. */
export function findMatches(runs: readonly TextRun[], query: string): Match[] {
  if (!query) return [];
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
  const found: Match[] = [];
  for (const { text, pos } of runs) {
    for (const m of text.matchAll(pattern)) {
      found.push({ from: pos + m.index, to: pos + m.index + m[0].length });
    }
  }
  return found;
}
