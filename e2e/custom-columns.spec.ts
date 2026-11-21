import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { escapeRegExp } from "./support/datasheet";
import { waitForRichTextEditors } from "./support/editor";

/**
 * Columns a project adds to its daily activities and its to-do list: added through the shared
 * columns dialog, filled in the datasheet, and still filled after a reload. Runs as e2e-pm on a
 * project of its own, so earlier runs never fill up the column limit.
 */

const D = messages.datasheet;
const COLUMN = "Vendor ref";
const cell = (column: string, row: string) =>
  new RegExp(`^${escapeRegExp(D.cellLabel(column, row))}$`);
// Matched on the header's own text, so a built-in header that contains the name never matches.
const header = (page: Page, name: string) =>
  page.getByRole("columnheader").filter({ has: page.getByText(name, { exact: true }) });

async function createProject(page: Page): Promise<string> {
  await page.goto("/projects/new");
  await page.getByLabel(messages.projects.name).fill(`E2E columns project ${Date.now()}`);
  await page.getByTestId("project-save").click();
  await page.waitForURL(/\/projects\/\d+/);
  return new URL(page.url()).pathname.split("/")[2]!;
}

async function expectCreated(page: Page, form: string) {
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(form)).toHaveCount(0);
}

async function addTextColumn(page: Page, title: string) {
  await page.getByTestId("register-columns").click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog.getByTestId("register-column")).toHaveCount(0);
  await dialog.getByTestId("register-column-add-name").fill(COLUMN);
  await dialog.getByTestId("register-column-add-kind").selectOption("text");
  await dialog.getByTestId("register-column-add-save").click();
  await expect(dialog.getByTestId("register-column")).toHaveCount(1, { timeout: 30_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(header(page, COLUMN)).toBeVisible({ timeout: 30_000 });
}

async function fillAndReload(page: Page, row: string, value: string) {
  const field = page.getByRole("textbox", { name: cell(COLUMN, row) });
  await field.fill(value);
  await field.press("Enter");
  await expect(page.getByTestId("live-announcer")).toHaveText(D.saved(COLUMN), {
    timeout: 30_000,
  });
  await page.reload();
  await expect(page.getByRole("textbox", { name: cell(COLUMN, row) })).toHaveValue(value, {
    timeout: 30_000,
  });
}

test.describe("project custom columns", () => {
  test("a column added to daily activities keeps its value across a reload", async ({ page }) => {
    const projectId = await createProject(page);
    const task = `E2E activity ${Date.now()}`;
    await page.goto(`/projects/${projectId}/daily-activities?id=new`);
    const form = page.getByTestId("daily-activity-form");
    await expect(form).toBeVisible();
    await form.getByLabel(messages.dailyActivities.task, { exact: true }).fill(task);
    await form.getByLabel(messages.dailyActivities.requester).fill("E2E Tester");
    await form.getByLabel(messages.dailyActivities.taskType).selectOption("Technical");
    await page.getByTestId("daily-activity-save").click();
    await expectCreated(page, "daily-activity-form");

    await page.goto(`/projects/${projectId}/daily-activities?view=list`);
    await addTextColumn(page, messages.customColumns.activityTitle);
    await fillAndReload(page, task, "PO-1042");
  });

  test("a column added to the to-do list keeps its value across a reload", async ({ page }) => {
    const projectId = await createProject(page);
    const title = `E2E todo ${Date.now()}`;
    await page.goto(`/projects/${projectId}/todos?id=new`);
    const form = page.getByTestId("todo-item-form");
    await expect(form).toBeVisible();
    await waitForRichTextEditors(form);
    await form.getByLabel(messages.todoItems.todoItem).fill(title);
    await form.getByLabel(messages.todoItems.priority).selectOption("High");
    await form.getByLabel(messages.todoItems.status).selectOption("Not Started");
    await page.getByTestId("todo-item-save").click();
    await expectCreated(page, "todo-item-form");

    await page.goto(`/projects/${projectId}/todos?view=list`);
    await addTextColumn(page, messages.customColumns.todoTitle);
    await fillAndReload(page, title, "PO-2077");
  });
});
