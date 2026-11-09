import { getSchema } from "@tiptap/core";
import type { Mark } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { richTextExtensions } from "../rich-text/extensions";
import { copyFormat, paintFormat } from "../rich-text/format-painter";

const schema = getSchema(richTextExtensions);

const text = (value: string, marks: object[]) => ({ type: "text", text: value, marks });
const link = (href: string) => ({ type: "link", attrs: { href } });

const doc = schema.nodeFromJSON({
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 3, textAlign: "center" },
      content: [text("Source", [{ type: "bold" }, link("https://a.example")])],
    },
    { type: "paragraph", content: [text("Target", [{ type: "italic" }])] },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [text("Item", [link("https://b.example")])] }],
        },
      ],
    },
    { type: "paragraph", content: [text("Two words", [])] },
    { type: "paragraph" },
  ],
});

function range(value: string) {
  let at = -1;
  doc.descendants((node, pos) => {
    if (node.isText && node.text === value) at = pos;
  });
  return [at, at + value.length] as const;
}

const select = (value: string) =>
  EditorState.create({ doc, selection: TextSelection.create(doc, ...range(value)) });

const names = (marks: readonly Mark[]) => marks.map((mark) => mark.type.name).sort();

describe("format painter", () => {
  it("copies the marks and style at the selection's start, leaving the link out", () => {
    const format = copyFormat(select("Source"));
    expect(names(format.marks)).toEqual(["bold"]);
    expect(format.block.type.name).toBe("heading");
    expect(format.block.attrs).toMatchObject({ level: 3, textAlign: "center" });
  });

  it("replaces the target's marks and paragraph style", () => {
    const painted = paintFormat(select("Target").tr, copyFormat(select("Source"))).doc.child(1);
    expect(painted.type.name).toBe("heading");
    expect(painted.attrs).toMatchObject({ level: 3, textAlign: "center" });
    expect(names(painted.firstChild!.marks)).toEqual(["bold"]);
  });

  it("keeps the target's link and a list item's opening paragraph", () => {
    const tr = paintFormat(select("Item").tr, copyFormat(select("Source")));
    const paragraph = tr.doc.child(2).firstChild!.firstChild!;
    expect(paragraph.type.name).toBe("paragraph");
    expect(names(paragraph.firstChild!.marks)).toEqual(["bold", "link"]);
  });

  const cursor = (at: number) =>
    EditorState.create({ doc, selection: TextSelection.create(doc, at) });

  it("paints only the clicked word when nothing is selected", () => {
    const painted = paintFormat(
      cursor(range("Two words")[0] + 6).tr,
      copyFormat(select("Source")),
    ).doc.child(3);
    expect(painted.type.name).toBe("heading");
    expect(painted.childCount).toBe(2);
    expect(painted.firstChild!.text).toBe("Two ");
    expect(painted.firstChild!.marks).toEqual([]);
    expect(painted.lastChild!.text).toBe("words");
    expect(names(painted.lastChild!.marks)).toEqual(["bold"]);
  });

  it("keeps the marks for the next typed text when the cursor is in no word", () => {
    const tr = paintFormat(cursor(doc.content.size - 1).tr, copyFormat(select("Source")));
    expect(tr.doc.lastChild!.type.name).toBe("heading");
    expect(names(tr.storedMarks ?? [])).toEqual(["bold"]);
  });
});
