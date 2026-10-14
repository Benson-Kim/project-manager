import { describe, expect, it } from "vitest";
import { richTextColumn } from "../data-view/columns";
import {
  CELL_WIDTH,
  CELL_WIDTH_PX,
  isCellChanged,
  isEditableTarget,
  panelPosition,
  previewText,
  type RichCellView,
} from "../data-view/datasheet";

interface Row {
  Id: number;
  Notes: string | null;
  view: RichCellView;
}

const column = richTextColumn<Row>({
  key: "Notes",
  header: "Notes",
  priority: 3,
  field: "notes",
  value: (r) => r.Notes,
  placeholder: "[Notes…]",
  view: (r) => r.view,
});

describe("rich-text datasheet cells (ADR-0023 amendment)", () => {
  it("edits the field as HTML, the way the record's form submits it", () => {
    const row = { Id: 1, Notes: "<p><strong>Hi</strong></p>", view: { html: null, node: null } };
    expect(column.edit).toMatchObject({ kind: "rich", field: "notes", placeholder: "[Notes…]" });
    expect(column.edit?.value(row)).toBe("<p><strong>Hi</strong></p>");
    expect(column.edit?.value({ ...row, Notes: null })).toBe("");
  });

  it("shows the server-rendered view while it matches the row's HTML", () => {
    const node = "formatted view";
    const row = { Id: 1, Notes: "<p>Hi</p>", view: { html: "<p>Hi</p>", node } };
    expect(column.edit?.display?.(row)).toBe(node);
    expect(column.render(row)).toBe(node);
  });

  it("shows the saved text plainly until the refresh brings a new view", () => {
    const row = {
      Id: 1,
      Notes: "<p>New <em>text</em></p>",
      view: { html: "<p>Old</p>", node: "old view" },
    };
    expect(column.edit?.display?.(row)).toBe("New text");
  });

  it("saves only a changed value, comparing the HTML as it is", () => {
    expect(isCellChanged("rich", "<p>a</p>", "<p>a</p>")).toBe(false);
    expect(isCellChanged("rich", "<p>a</p>", "<p>a</p> ")).toBe(true);
  });

  it("is wider than a text cell", () => {
    expect(CELL_WIDTH.rich).toBe("min-w-72");
    expect(CELL_WIDTH_PX.rich).toBeGreaterThan(CELL_WIDTH_PX.text);
  });
});

describe("previewText", () => {
  it("joins blocks with spaces and decodes entities", () => {
    expect(previewText("<p>One</p><p>Two &amp; three</p><ul><li>a</li><li>b</li></ul>")).toBe(
      "One Two & three a b",
    );
    expect(previewText("Line<br>break&nbsp;here")).toBe("Line break here");
  });

  it("keeps markup as text, never as HTML", () => {
    expect(previewText("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>")).toBe(
      "<script>alert(1)</script>",
    );
    expect(previewText('<img src=x onerror="alert(1)">Hi')).toBe("Hi");
  });

  it("is empty for no text", () => {
    expect(previewText(null)).toBe("");
    expect(previewText("<p></p>")).toBe("");
  });
});

describe("panelPosition", () => {
  const viewport = { width: 1280, height: 800 };

  it("opens under the cell, at least 560 px wide", () => {
    expect(panelPosition({ left: 100, top: 200, bottom: 248, width: 288 }, viewport)).toEqual({
      left: 100,
      width: 560,
      top: 252,
      maxHeight: 532,
    });
  });

  it("opens over the cell when there's more room above", () => {
    const position = panelPosition({ left: 100, top: 600, bottom: 648, width: 288 }, viewport);
    expect(position.top).toBeUndefined();
    expect(position.bottom).toBe(204);
    expect(position.maxHeight).toBe(580);
  });

  it("stays on screen on a phone and next to the right edge", () => {
    expect(
      panelPosition({ left: 200, top: 100, bottom: 148, width: 288 }, { width: 360, height: 640 }),
    ).toMatchObject({ left: 16, width: 328 });
    expect(
      panelPosition({ left: 1100, top: 100, bottom: 148, width: 288 }, viewport),
    ).toMatchObject({ left: 704, width: 560 });
  });
});

describe("isEditableTarget", () => {
  it("leaves keys typed into a rich-text editor to the editor", () => {
    expect(isEditableTarget({ tagName: "P", isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: "P", isContentEditable: false })).toBe(false);
  });
});
