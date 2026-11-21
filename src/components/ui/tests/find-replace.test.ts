import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { history, undo } from "@tiptap/pm/history";
import { Schema } from "@tiptap/pm/model";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  findReplacePlugin,
  readFind,
  replaceAll,
  replaceCurrent,
  setFind,
  stepFind,
} from "../rich-text/find-replace";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: {},
  },
});

function fakeView(text: string) {
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text(text)])]);
  const view = {
    state: EditorState.create({ doc, plugins: [history(), findReplacePlugin()] }),
    dispatches: 0,
    dispatch(tr: Transaction) {
      view.dispatches += 1;
      view.state = view.state.apply(tr);
    },
    domAtPos: () => ({ node: { nodeType: 1, scrollIntoView: () => {} } }),
  };
  return view;
}

const asView = (view: ReturnType<typeof fakeView>) => view as unknown as EditorView;
const text = (view: ReturnType<typeof fakeView>) => view.state.doc.textContent;

beforeEach(() => {
  vi.stubGlobal("Node", { ELEMENT_NODE: 1 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("find and replace", () => {
  it("counts every match in any case and selects the first", () => {
    const view = fakeView("Risk and risk, RISK");
    setFind(asView(view), "risk");
    expect(readFind(view.state)).toEqual({ current: 0, total: 3 });
    expect([view.state.selection.from, view.state.selection.to]).toEqual([1, 5]);
  });

  it("steps through the matches and wraps at both ends", () => {
    const view = fakeView("a b a");
    setFind(asView(view), "a");
    stepFind(asView(view), -1);
    expect(readFind(view.state).current).toBe(1);
    stepFind(asView(view), 1);
    expect(readFind(view.state).current).toBe(0);
  });

  it("moves past its own replacement when the replacement holds the search", () => {
    const view = fakeView("a b a");
    setFind(asView(view), "a");
    replaceCurrent(asView(view), "aa");
    expect(text(view)).toBe("aa b a");
    expect(view.state.selection.from).toBe(6);
  });

  it("replaces every match in one step that one undo reverts", () => {
    const view = fakeView("a b a");
    setFind(asView(view), "a");
    view.dispatches = 0;
    expect(replaceAll(asView(view), "x")).toBe(2);
    expect(text(view)).toBe("x b x");
    expect(view.dispatches).toBe(1);
    undo(view.state, (tr) => view.dispatch(tr));
    expect(text(view)).toBe("a b a");
  });
});
