import type { Locator } from "@playwright/test";

/** The people in a stakeholder picker's open list, leaving out its "Add new" item, which comes first. */
export function listedPeople(scope: Locator): Locator {
  return scope
    .getByRole("listbox")
    .locator('[role="option"]:not([data-testid="combobox-add-new"])');
}
