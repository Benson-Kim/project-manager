import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { escapeRegExp } from "./support/datasheet";

/**
 * Datasheet mode of the DataView (ADR-0023) and the dropdown-list editor
 * (ADR-0022), client feedback §2–4. Runs as e2e-pm, Manager on project 2.
 * The list editor is exercised on the kitchen sink (local lists), so no Admin
 * login is spent (login budget, LESSONS §13).
 */
const KD = messages.keyDeliverables;
const newEntry = (column: string) => messages.datasheet.newEntryField(column);
const cell = (column: string, row: string) =>
  new RegExp(`^${escapeRegExp(messages.datasheet.cellLabel(column, row))}$`);

async function addDeliverable(page: import("@playwright/test").Page, requirement: string) {
  await page.goto("/projects/2/deliverables?view=list");
  const addRow = page.getByTestId("datasheet-add-row");
  await expect(addRow).toBeVisible();
  const field = addRow.getByRole("textbox", { name: newEntry(KD.requirement) });
  await expect(field).toHaveAttribute("placeholder", KD.placeholders.requirement);
  await field.fill(requirement);
  await addRow.getByRole("combobox", { name: newEntry(KD.status) }).selectOption("Pending");
  await field.press("Enter");
  // The row clears for the next entry once the record is saved.
  await expect(field).toHaveValue("");
}

test("new-entry row: Enter adds the record and clears the row", async ({ page }) => {
  const requirement = `E2E datasheet ${Date.now()}`;
  await addDeliverable(page, requirement);
  await page.goto(`/projects/2/deliverables?view=list&q=${encodeURIComponent(requirement)}`);
  await expect(page.getByRole("textbox", { name: cell(KD.requirement, requirement) })).toHaveValue(
    requirement,
  );
  await expect(page.getByRole("combobox", { name: cell(KD.status, requirement) })).toHaveValue(
    "Pending",
  );
});

test("a cell saves in place and keeps its value after reload", async ({ page }) => {
  const requirement = `E2E cell ${Date.now()}`;
  await addDeliverable(page, requirement);
  await page.goto(`/projects/2/deliverables?view=list&q=${encodeURIComponent(requirement)}`);

  await page.getByRole("combobox", { name: cell(KD.priority, requirement) }).selectOption("Low");
  await expect(page.getByText(messages.datasheet.saved(KD.priority))).toBeAttached();

  const text = page.getByRole("textbox", { name: cell(KD.requirement, requirement) });
  await text.fill(`${requirement} edited`);
  await text.press("Escape");
  await expect(text).toHaveValue(requirement);

  await page.reload();
  await expect(page.getByRole("combobox", { name: cell(KD.priority, requirement) })).toHaveValue(
    "Low",
  );
});

test("dropdown lists are edited by Admins only: no header carets for a project manager", async ({
  page,
}) => {
  await page.goto("/projects/2/deliverables?view=list");
  await expect(page.getByTestId("data-view-table")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Edit dropdown list:/ })).toHaveCount(0);
});

test("datasheet list view has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/projects/2/deliverables?view=list");
  await expect(page.getByTestId("datasheet-add-row")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(blocking).toEqual([]);
});

test("the header caret edits a list and every select updates at once (kitchen sink)", async ({
  page,
}) => {
  await page.goto("/kitchen-sink?view=list");
  await expect(page.getByTestId("data-view-table")).toBeVisible();
  await page.getByRole("button", { name: messages.lookupLists.edit("Status") }).click();

  const dialog = page.getByRole("dialog", { name: messages.lookupLists.edit("Status") });
  await expect(dialog).toBeVisible();
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(
    results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);

  await dialog.getByLabel(messages.lookupLists.newOption).fill("Blocked");
  await dialog.getByRole("button", { name: messages.lookupLists.addNew }).click();
  await dialog.getByRole("button", { name: messages.lookupLists.moveUp("Blocked") }).click();
  await dialog.getByRole("button", { name: messages.actions.save }).click();
  await expect(dialog).toBeHidden();

  // Both the data rows and the new-entry row offer the new option without a reload.
  await expect(
    page.getByRole("combobox", { name: cell("Status", "Network refresh") }).getByRole("option", {
      name: "Blocked",
    }),
  ).toBeAttached();
  await expect(
    page
      .getByTestId("datasheet-add-row")
      .getByRole("combobox", { name: newEntry("Status") })
      .getByRole("option", { name: "Blocked" }),
  ).toBeAttached();
});
