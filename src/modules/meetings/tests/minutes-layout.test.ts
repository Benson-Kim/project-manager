import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const components = "src/modules/meetings/components/";

function source(file: string): string {
  return readFileSync(components + file, "utf8").replace(/\r\n/g, "\n");
}

function expectInOrder(text: string, markers: string[]): void {
  const at = markers.map((marker) => text.indexOf(marker));
  markers.forEach((marker, i) => expect(at[i], marker).toBeGreaterThanOrEqual(0));
  expect([...at].sort((a, b) => a - b)).toEqual(at);
}

describe("minutes layout", () => {
  it("shows the agenda, the notes, added sections, action items, then the action follow-ups last", () => {
    expectInOrder(source("minutes-editor.tsx"), [
      'sectionKey="Agenda"',
      "{notes}",
      "<CustomSections",
      "<ActionItemsTable",
      'data-testid="carried-over"',
    ]);
  });

  it("puts the Summary panel before the Conclusion panel", () => {
    expectInOrder(source("meeting-header-form.tsx"), [
      'titleKey="Summary"',
      'titleKey="Conclusion"',
    ]);
  });

  it("puts the Add section button above the added sections", () => {
    expectInOrder(source("minutes-sections.tsx"), [
      'data-testid="add-section"',
      'data-testid="custom-section"',
    ]);
  });

  it("colours new action items green and follow-ups blue", () => {
    expect(source("action-items-table.tsx")).toContain("border-success bg-success-soft");
    expect(source("minutes-editor.tsx")).toContain("border-accent bg-accent-soft");
  });
});
