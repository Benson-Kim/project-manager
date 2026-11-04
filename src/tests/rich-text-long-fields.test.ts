import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { asRichText } from "@/lib/rich-text/plain-text";

describe("asRichText", () => {
  it("turns each line of old plain text into a paragraph, escaped", () => {
    expect(asRichText("Scope agreed\nBudget < 5k & signed")).toBe(
      "<p>Scope agreed</p><p>Budget &lt; 5k &amp; signed</p>",
    );
  });

  it("leaves rich text and empty values alone", () => {
    expect(asRichText('<p><mark data-color="#fef08a">Late</mark></p>')).toBe(
      '<p><mark data-color="#fef08a">Late</mark></p>',
    );
    expect(asRichText("")).toBe("");
  });
});

/** The long fields that take colour and highlight (client feedback 2026-10-23, item 7). */
const LONG_FIELDS: [form: string, field: string][] = [
  ["src/modules/projects/components/project-form.tsx", "mandate"],
  ["src/modules/projects/components/project-form.tsx", "problemStatement"],
  ["src/modules/projects/components/project-form.tsx", "currentState"],
  ["src/modules/projects/components/project-form.tsx", "futureState"],
  ["src/modules/projects/components/project-form.tsx", "userImpact"],
  ["src/modules/questions-answers/components/question-answer-sheet.tsx", "answer"],
  ["src/modules/objectives/components/objective-sheet.tsx", "qSuccess"],
  ["src/modules/parking-lot/components/parking-lot-item-sheet.tsx", "followUpActions"],
  ["src/modules/todo-items/components/todo-item-sheet.tsx", "notes"],
  ["src/modules/daily-activities/components/daily-activity-sheet.tsx", "comments"],
];

describe("long text fields take rich text", () => {
  it.each(LONG_FIELDS)("%s edits %s with the rich-text editor", (form, field) => {
    const source = readFileSync(form, "utf-8");
    expect(source).toContain(`<RichTextEditor name="${field}"`);
    expect(source).not.toMatch(new RegExp(`<Textarea[^>]*name="${field}"`));
  });
});

/**
 * A form field grows between a floor and a ceiling and scrolls inside, so one
 * long field cannot push the rest of a form away ("the box extends too far").
 * A notebook page is the opposite case: it is the whole writing surface, so it
 * grows with its text and the page scrolls. Giving it a ceiling froze it at
 * 60dvh, the page stopped scrolling, and the toolbar that is meant to stay in
 * view under the header never moved (e2e/notes.spec.ts:342).
 */
describe("the editor surface bounds a field but not a page", () => {
  const SURFACE = readFileSync("src/components/ui/rich-text/editor-surface.tsx", "utf-8");
  const BOUNDED = SURFACE.match(/const BOUNDED = "([^"]+)"/)?.[1] ?? "";
  const HEIGHTS = SURFACE.slice(
    SURFACE.indexOf("const HEIGHTS"),
    SURFACE.indexOf("export interface EditorSurfaceProps"),
  );

  /** The classes written for one EditorHeight, with BOUNDED spelled out. */
  const classes = (height: string) =>
    (HEIGHTS.split("\n").find((l) => l.trimStart().startsWith(`${height}:`)) ?? "").replace(
      "${BOUNDED}",
      BOUNDED,
    );

  it("gives a form field and a panel a ceiling as well as a floor", () => {
    expect(classes("field")).toMatch(/min-h-48.*max-h-\[min\(24rem,60dvh\)\]/);
    expect(classes("panel")).toMatch(/min-h-\[min\(24rem,50dvh\)\].*max-h-\[min\(32rem,70dvh\)\]/);
  });

  it.each(["field", "panel"])("scrolls a bounded %s instead of clipping it", (height) => {
    expect(classes(height)).toContain("overflow-y-auto");
    expect(classes(height)).not.toContain("overflow-y-hidden");
  });

  it("lifts a ceiling for print so a long field is not cut off on paper", () => {
    expect(BOUNDED).toContain("print:max-h-none");
    expect(BOUNDED).toContain("print:overflow-visible");
  });

  it("lets a whole-page surface grow, so the page scrolls and not the box", () => {
    expect(classes("page")).toContain("min-h-");
    expect(classes("page")).not.toContain("max-h-");
    expect(classes("page")).not.toContain("overflow-y-auto");
  });

  it("is the height a notebook page asks for", () => {
    const workspace = readFileSync("src/modules/notes/components/notebook-workspace.tsx", "utf-8");
    expect(workspace).toMatch(/name="content"[\s\S]*?height="page"/);
  });
});
