import { Extension } from "@tiptap/core";
import { type EditorState, Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { findMatches, type Match, textRuns } from "./find-matches";

interface FindState {
  query: string;
  current: number;
  matches: Match[];
  decorations: DecorationSet;
}

interface FindMeta {
  query: string;
  current: number;
}

const findKey = new PluginKey<FindState>("find-replace");

function wrap(index: number, total: number) {
  return total ? ((index % total) + total) % total : 0;
}

function build(doc: PMNode, query: string, current: number): FindState {
  const matches = findMatches(textRuns(doc), query);
  const index = Math.min(Math.max(current, 0), Math.max(matches.length - 1, 0));
  const decorations = DecorationSet.create(
    doc,
    matches.map((m, i) =>
      Decoration.inline(m.from, m.to, {
        class: i === index ? "find-match find-match-current" : "find-match",
      }),
    ),
  );
  return { query, current: index, matches, decorations };
}

/** Highlights every match of the find bar's text; the bar drives it through the helpers below. */
export function findReplacePlugin() {
  return new Plugin<FindState>({
    key: findKey,
    state: {
      init: (_, state) => build(state.doc, "", 0),
      apply: (tr, prev) => {
        const meta = tr.getMeta(findKey) as FindMeta | undefined;
        if (meta) return build(tr.doc, meta.query, meta.current);
        if (tr.docChanged && prev.query) return build(tr.doc, prev.query, prev.current);
        return prev;
      },
    },
    props: {
      decorations: (state) => findKey.getState(state)?.decorations,
    },
  });
}

export const FindReplace = Extension.create({
  name: "findReplace",
  addProseMirrorPlugins: () => [findReplacePlugin()],
});

export function readFind(state: EditorState) {
  const found = findKey.getState(state);
  return { current: found?.current ?? 0, total: found?.matches.length ?? 0 };
}

/** Marks the match without moving focus out of the find bar, and brings it into view. */
function show(view: EditorView, match: Match | undefined) {
  if (!match) return;
  const { node } = view.domAtPos(match.from);
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  element?.scrollIntoView?.({ block: "nearest" });
}

function select(view: EditorView, meta: FindMeta, tr = view.state.tr) {
  const matches = findMatches(textRuns(tr.doc), meta.query);
  const current = wrap(meta.current, matches.length);
  const match = matches[current];
  tr.setMeta(findKey, { query: meta.query, current });
  if (match) tr.setSelection(TextSelection.create(tr.doc, match.from, match.to));
  view.dispatch(tr);
  show(view, match);
}

export function setFind(view: EditorView, query: string, current = 0) {
  select(view, { query, current });
}

export function stepFind(view: EditorView, step: 1 | -1) {
  const found = findKey.getState(view.state);
  if (!found?.matches.length) return;
  select(view, { query: found.query, current: found.current + step });
}

export function replaceCurrent(view: EditorView, text: string) {
  const found = findKey.getState(view.state);
  const match = found?.matches[found.current];
  if (!found || !match) return;
  const tr = view.state.tr.insertText(text, match.from, match.to);
  const after = match.from + text.length;
  const next = findMatches(textRuns(tr.doc), found.query).findIndex((m) => m.from >= after);
  select(view, { query: found.query, current: Math.max(next, 0) }, tr);
}

/** One step, so one Undo puts every match back. */
export function replaceAll(view: EditorView, text: string) {
  const found = findKey.getState(view.state);
  if (!found?.matches.length) return 0;
  const tr = view.state.tr;
  for (const match of [...found.matches].reverse()) tr.insertText(text, match.from, match.to);
  select(view, { query: found.query, current: 0 }, tr);
  return found.matches.length;
}
