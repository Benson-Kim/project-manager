import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { richTextExtensions } from "../rich-text/extensions";
import { innermostList, setInnermostNumbering } from "../rich-text/format-extensions";

const schema = getSchema(richTextExtensions);

const item = (text: string, nested?: object) => ({
  type: "listItem",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }, ...(nested ? [nested] : [])],
});

/** An ordered list whose first item holds a nested `innerType` list. */
function nestedDoc(innerType: "orderedList" | "bulletList") {
  return schema.nodeFromJSON({
    type: "doc",
    content: [
      {
        type: "orderedList",
        content: [item("outer", { type: innerType, content: [item("inner")] }), item("after")],
      },
    ],
  });
}

function stateAt(doc: ReturnType<typeof nestedDoc>, text: string) {
  let at = -1;
  doc.descendants((node, pos) => {
    if (node.isText && node.text === text) at = pos + 1;
  });
  return EditorState.create({ doc, selection: TextSelection.create(doc, at) });
}

const lists = (doc: ReturnType<typeof nestedDoc>) => {
  const found: { type: string; attrs: Record<string, unknown> }[] = [];
  doc.descendants((node) => {
    if (node.type.name.endsWith("List")) found.push({ type: node.type.name, attrs: node.attrs });
  });
  return found;
};

describe("numbering applies to the innermost list only", () => {
  it("styles the nested ordered list and leaves the outer one alone", () => {
    const state = stateAt(nestedDoc("orderedList"), "inner");
    const tr = state.tr;
    expect(setInnermostNumbering(tr, { type: "a" })).toBe(true);
    expect(setInnermostNumbering(tr, { start: 4 })).toBe(true);
    const [outer, inner] = lists(tr.doc);
    expect(inner.attrs).toMatchObject({ type: "a", start: 4 });
    expect(outer.attrs).toMatchObject(lists(state.doc)[0].attrs);
  });

  it("styles the outer list when the cursor is in it", () => {
    const tr = stateAt(nestedDoc("orderedList"), "after").tr;
    setInnermostNumbering(tr, { type: "I" });
    const [outer, inner] = lists(tr.doc);
    expect(outer.attrs.type).toBe("I");
    expect(inner.attrs.type).not.toBe("I");
  });

  it("refuses when the innermost list is a bullet list, even inside an ordered one", () => {
    const state = stateAt(nestedDoc("bulletList"), "inner");
    expect(innermostList(state.selection.$from)?.node.type.name).toBe("bulletList");
    const tr = state.tr;
    expect(setInnermostNumbering(tr, { type: "a" })).toBe(false);
    expect(tr.docChanged).toBe(false);
  });

  it("finds no list outside one", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "plain" }] }],
    });
    expect(innermostList(stateAt(doc, "plain").selection.$from)).toBeNull();
  });
});
