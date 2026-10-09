import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("todo alert UI review guardrails", () => {
  it("passes alert permissions independently of to-do edit permission", () => {
    const sheet = source("src/modules/todo-items/components/todo-item-sheet.tsx");
    const globalPage = source("src/app/(app)/todo/page.tsx");
    const projectPage = source("src/app/(app)/projects/[id]/todos/page.tsx");

    expect(sheet).toContain("const canSaveAlert = todoAlert ? canUpdateAlert : canCreateAlert");
    expect(sheet).not.toContain("{todoItem && canEdit ? (");

    for (const page of [globalPage, projectPage]) {
      expect(page).toContain('allows("todo-alerts:create")');
      expect(page).toContain('allows("todo-alerts:update")');
      expect(page).toContain("canCreateAlert={canCreateAlert}");
      expect(page).toContain("canUpdateAlert={canUpdateAlert}");
    }
  });

  it("guards both forms against accidental close and confirms alert removal", () => {
    const sheet = source("src/modules/todo-items/components/todo-item-sheet.tsx");

    expect(sheet).toContain("useUnsavedChangesGuard(itemDirty || alertDirty)");
    expect(sheet).toContain("onChange={canEdit ? markItemFormDirty : undefined}");
    expect(sheet).toContain("onChange={markAlertFormDirty}");
    expect(sheet).toContain("if (!next) requestClose()");
    expect(sheet).toContain("onClick={() => setConfirmRemoveAlert(true)}");
    expect(sheet).toContain("open={confirmRemoveAlert}");
  });

  it("preserves a null project id for unscoped global items", () => {
    const globalPage = source("src/app/(app)/todo/page.tsx");
    const sheet = source("src/modules/todo-items/components/todo-item-sheet.tsx");

    expect(globalPage).toContain("projectId={selected?.ProjectId ?? null}");
    expect(sheet).toContain('value={todoItem?.ProjectId ?? projectId ?? ""}');
  });

  it("keeps both reorder controls at the minimum touch-target size", () => {
    const view = source("src/modules/todo-items/components/todo-view.tsx");
    expect(view.match(/className="flex size-11 /g)).toHaveLength(2);
  });
});
