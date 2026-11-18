import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardrail: "Add new" in a stakeholder picker creates a stakeholder, so each page that shows a
 * picker offers it only to users the server lets create one. The flag comes from the same
 * permission the create action checks, never from a literal.
 */
const APP = "src/app/(app)/projects/[id]";

const PAGES: [string, string][] = [
  [`${APP}/page.tsx`, "canAddStakeholder"],
  [`${APP}/decisions/page.tsx`, "canAddStakeholder"],
  [`${APP}/deliverables/page.tsx`, "canAddStakeholder"],
  [`${APP}/deliverables/gantt/page.tsx`, "canAddStakeholder"],
  [`${APP}/meetings/[meetingId]/page.tsx`, "canAddStakeholder"],
  [`${APP}/responsibility/page.tsx`, "canCreate"],
];

const COMPONENTS: [string, string][] = [
  [
    "src/modules/projects/components/assignees-editor.tsx",
    "useStakeholderQuickCreate(canEdit && canAddStakeholder)",
  ],
  [
    "src/modules/decisions/components/decision-sheet.tsx",
    "const canAdd = canEdit && canAddStakeholder;",
  ],
  ["src/modules/key-deliverables/components/deliverable-form.tsx", "canAdd={canAddStakeholder}"],
  ["src/modules/meetings/components/minutes-forms.tsx", "canAdd={canAddStakeholder}"],
  [
    "src/modules/stakeholders/components/responsibility-view.tsx",
    "useStakeholderQuickCreate(canCreate)",
  ],
];

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("a stakeholder picker offers Add new only to those who may create stakeholders", () => {
  it.each(PAGES)("%s takes %s from stakeholders:create", (path, prop) => {
    expect(source(path)).toContain(`${prop}={allows("stakeholders:create")}`);
  });

  it.each(COMPONENTS)("%s wires Add new from that flag", (path, wiring) => {
    expect(source(path)).toContain(wiring);
  });

  it.each([...PAGES.map(([p]) => p), ...COMPONENTS.map(([p]) => p)])(
    "%s never turns Add new on with a literal",
    (path) => {
      expect(source(path)).not.toMatch(/canAdd(Stakeholder)?=\{true\}/);
      expect(source(path)).not.toContain("useStakeholderQuickCreate(true)");
    },
  );

  it("the create action behind Add new checks the same permission", () => {
    expect(source("src/modules/stakeholders/actions/index.ts")).toMatch(
      /createStakeholderAction[\s\S]{0,400}stakeholders:create/,
    );
  });
});
