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
