import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { projectOverviewHref } from "@/modules/projects/project-links";

/**
 * Guardrail: wherever a cross-project list shows which project a record belongs
 * to, that name reaches the project's Overview (client feedback, 2026-10-31).
 *
 * The navigation itself cannot be proven here — nothing browser-shaped runs in
 * this workspace — so what is held is the construction it depends on. Two ways
 * this breaks read as working code. An anchor is not one of the controls the
 * sheet counts as an edit target, so a link dropped into a clickable row also
 * fires the row's own `onOpen` and the two race to different pages. And a name
 * left as plain text in a column with no `edit` is a dead end that looks fine,
 * because a cell the actor may edit renders the editor instead of `render` —
 * the link only ever shows on the rows that have no editor.
 */

const LINK = "src/components/ui/project-link.tsx";
const SECTIONS = "src/components/shell/project-sections.ts";

/** Every list that shows a project name it does not own. */
const CROSS_PROJECT_LISTS = [
  "src/components/ui/data-view/columns.tsx",
  "src/modules/notes/components/notes-view.tsx",
  "src/modules/boards/components/boards-list.tsx",
  "src/modules/boards/components/board-workspace.tsx",
  "src/modules/todo-items/components/todo-view.tsx",
  "src/modules/daily-activities/components/daily-activities-view.tsx",
];

const source = (path: string) => readFileSync(path, "utf8");

describe("a project's Overview has one href", () => {
  it("is built from the project id alone", () => {
    expect(projectOverviewHref(42)).toBe("/projects/42");
  });

  it("is what the project nav's section href resolves to", () => {
    expect(source(SECTIONS)).toContain("projectOverviewHref");
  });
});

describe("the project link survives a clickable row", () => {
  it("stops the click reaching the row underneath", () => {
    expect(source(LINK)).toContain("stopPropagation");
  });

  it("falls back to plain text when the record has no project", () => {
    expect(source(LINK)).toContain("projectId === null");
  });
});

describe("every cross-project list links the project name", () => {
  for (const path of CROSS_PROJECT_LISTS) {
    it(`${path} renders the name through the shared link`, () => {
      const text = source(path);
      expect(text).toContain("ProjectLink");
      expect(text).toMatch(/<ProjectLink projectId=\{[^}]*ProjectId\}/);
    });
  }
});
