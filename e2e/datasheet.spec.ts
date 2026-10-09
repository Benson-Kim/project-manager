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

test("option colours tint cells and rows; 'Edit list…' in a cell opens the editor (kitchen sink)", async ({
  page,
}) => {
  await page.goto("/kitchen-sink?view=list");
  const table = page.getByTestId("data-view-table");
  await expect(table).toBeVisible();
  // The demo list colours rows: "In progress" is blue.
  await expect(table.locator('tbody tr[data-tone="blue"]')).toHaveCount(1);

  // "Edit list…" at the end of a cell's dropdown opens the editor without changing the value.
  const status = page.getByRole("combobox", { name: cell("Status", "Network refresh") });
  await status.selectOption({ label: messages.lookupLists.editInline });
  const dialog = page.getByRole("dialog", { name: messages.lookupLists.edit("Status") });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("combobox", { name: messages.lookupLists.color("Completed") })
    .selectOption({ label: messages.lookupLists.colors.red });
  await dialog.getByRole("button", { name: messages.actions.save }).click();
  await expect(dialog).toBeHidden();
  await expect(status).toHaveValue("In progress");
  await expect(table.locator('tbody tr[data-tone="red"]')).toHaveCount(1);
});

test("daily activities: the client's column order, and a project filter on the cross-project page", async ({
  page,
}) => {
  await page.goto("/projects/2/daily-activities?view=list");
  const headers = page.getByTestId("data-view-table").locator("thead th[data-column]");
  await expect(headers).toHaveText([
    messages.projectPicker.header,
    messages.dailyActivities.requester,
    messages.dailyActivities.requestDate,
    messages.dailyActivities.contactMethod,
    messages.dailyActivities.columns.task,
    messages.dailyActivities.columns.myActivity,
    messages.dailyActivities.columns.activityDate,
    messages.dailyActivities.activityStatus,
    messages.dailyActivities.comments,
    messages.dailyActivities.columns.completeDate,
  ]);

  await page.goto("/daily-activities?view=list");
  await page.getByTestId("filter-project").selectOption("none");
  await expect(page).toHaveURL(/project=none/);
  // Persistent new-entry row, starting with no project.
  await expect(
    page
      .getByTestId("datasheet-add-row")
      .getByRole("combobox", { name: newEntry(messages.projectPicker.header) }),
  ).toHaveValue("");
});

test("table layout: a column edge resizes by keyboard and persists; Reset restores the default", async ({
  page,
}) => {
  await page.goto("/projects/2/objectives?view=list");
  const table = page.getByTestId("data-view-table");
  await expect(table).toBeVisible();
  const handle = table.locator("thead th[data-column]").first().getByRole("separator");
  // Each arrow step saves the layout (a server action: the only POSTs this page sends here);
  // reload only after both have been answered.
  let saves = 0;
  page.on("response", (response) => {
    if (response.request().method() === "POST") saves += 1;
  });
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", /\d+/);
  const width = await handle.getAttribute("aria-valuenow");
  await expect.poll(() => saves).toBeGreaterThanOrEqual(2);

  await page.reload();
  await expect(
    page
      .getByTestId("data-view-table")
      .locator("thead th[data-column]")
      .first()
      .getByRole("separator"),
  ).toHaveAttribute("aria-valuenow", width!);

  await page.getByTestId("table-layout").click();
  const dialog = page.getByRole("dialog", { name: messages.datasheet.tableLayout });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: messages.datasheet.resetLayout }).click();
  await expect(dialog).toBeHidden();
  // Back to the default width: the splitter reports the rendered size, not the stored one.
  await expect(
    page
      .getByTestId("data-view-table")
      .locator("thead th[data-column]")
      .first()
      .getByRole("separator"),
  ).not.toHaveAttribute("aria-valuenow", width!);
});
