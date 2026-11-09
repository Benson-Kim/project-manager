import type { Mark, NodeType, ResolvedPos } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

/** Formatting carried by the format painter: text marks and the paragraph's style. */
export type PaintedFormat = {
  marks: readonly Mark[];
  block: { type: NodeType; attrs: Record<string, unknown> };
};

/** A link is content, not formatting: the painter neither copies nor clears it. */
const KEPT = "link";

/** The format at the start of the selection, as Word's format painter copies it. */
export function copyFormat(state: EditorState): PaintedFormat {
  const { from, to, empty, $from } = state.selection;
  let marks: readonly Mark[] | null = empty ? (state.storedMarks ?? $from.marks()) : null;
  if (!marks)
    state.doc.nodesBetween(from, to, (node) => {
      if (!marks && node.isText) marks = node.marks;
      return !marks;
    });
  return {
    marks: (marks ?? $from.marks()).filter((mark) => mark.type.name !== KEPT),
    block: { type: $from.parent.type, attrs: { ...$from.parent.attrs } },
  };
}

const WORD = /[\p{L}\p{N}_'’]/u;

/** The word the cursor is in or touching, as Word's painter takes on a click. */
function wordAround($pos: ResolvedPos) {
  const parent = $pos.parent;
  const charAt = (offset: number) => {
    const { node, offset: start } = parent.childAfter(offset);
    return node?.isText ? (node.text?.[offset - start] ?? "") : "";
  };
  let start = $pos.parentOffset;
  let end = start;
  while (start > 0 && WORD.test(charAt(start - 1))) start--;
  while (end < parent.content.size && WORD.test(charAt(end))) end++;
  return { from: $pos.start() + start, to: $pos.start() + end };
}

/**
 * Applies a copied format to the transaction's selection, or to the word at an
 * empty selection: its text takes exactly the copied marks, and each paragraph
 * or heading it touches takes the copied style where its parent allows it (a
 * list item must start with a paragraph). A cursor outside any word keeps the
 * marks for the next typed text.
 */
export function paintFormat(tr: Transaction, format: PaintedFormat): Transaction {
  const { selection } = tr;
  const { from, to } = selection.empty ? wordAround(selection.$from) : selection;
  const empty = from === to;
  const { type, attrs } = format.block;
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true;
    const $pos = tr.doc.resolve(pos);
    const index = $pos.index();
    if ($pos.parent.canReplaceWith(index, index + 1, type)) tr.setNodeMarkup(pos, type, attrs);
    return false;
  });
  if (empty) return tr.setStoredMarks(format.marks);
  for (const markType of Object.values(tr.doc.type.schema.marks))
    if (markType.name !== KEPT) tr.removeMark(from, to, markType);
  for (const mark of format.marks) tr.addMark(from, to, mark);
  return tr;
}
