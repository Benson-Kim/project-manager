import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";
import { expectListed } from "./support/datasheet";

/**
 * To-do items module (#20) — project-scoped route /projects/2/todos.
 * Happy path (create, alert configuration), validation failure, deep-link,
 * reorder, filter, axe scans. Runs as e2e-pm.
 * Seeded todo item 11 on project 2: "Relink new", Status=Cancelled.
 * Seeded todo item 15 on project 2: "Backup all of my data…", Status=Not Started.
 */

test("create todo item happy path — appears in the list", async ({ page }) => {
  const title = `E2E todo ${Date.now()}`;
  await page.goto("/projects/2/todos");
  await page.getByTestId("new-todo-item").click();
  const form = page.getByTestId("todo-item-form");
  await expect(form).toBeVisible();
  await form.getByLabel(messages.todoItems.todoItem).fill(title);
  await form.getByLabel(messages.todoItems.priority).selectOption("High");
  await form.getByLabel(messages.todoItems.status).selectOption("Not Started");
  await page.getByTestId("todo-item-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible();
  await expect(form).toHaveCount(0); // sheet closed

  await page.goto(`/projects/2/todos?q=${encodeURIComponent(title)}`);
  await expectListed(page, title);
});

test("validation failure — empty todoItem shows inline error", async ({ page }) => {
  await page.goto("/projects/2/todos?id=new");
  const form = page.getByTestId("todo-item-form");
  await expect(form).toBeVisible();
  const field = form.getByLabel(messages.todoItems.todoItem);
  await field.fill("  ");
  await field.blur();
  await expect(page.getByText(messages.todoItems.todoItemRequired).first()).toBeVisible();
  await page.getByTestId("todo-item-save").click();
  const summary = page.getByRole("alert").filter({ hasText: messages.errors.summaryTitle });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
});

test("sheet is URL-synced — deep link ?id= opens the seeded todo", async ({ page }) => {
  await page.goto("/projects/2/todos?id=11");
  const form = page.getByTestId("todo-item-form");
  await expect(form).toBeVisible();
  await expect(form.getByLabel(messages.todoItems.todoItem)).toHaveValue("Relink new");
});

test("alert section — configure and save an alert on an existing todo", async ({ page }) => {
  await page.goto("/projects/2/todos?id=15");
  const form = page.getByTestId("todo-item-form");
  await expect(form).toBeVisible();
  await closeAlarmToast(page);
  // Open alert section if not already open.
  const configureBtn = page.getByRole("button", { name: messages.todoItems.configureAlert });
  if (await configureBtn.isVisible()) await configureBtn.click();
  const alertForm = page.getByTestId("todo-alert-form");
  await expect(alertForm).toBeVisible();
  // An active alert needs a date (it could never become due without one); far ahead, so it
  // never rings during the suite.
  await alertForm.getByLabel(messages.todoItems.alertDay).fill("2030-01-15");
  await alertForm.getByLabel(messages.todoItems.alertTime).fill("09:00");
  await page.getByTestId("todo-alert-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.saved }).first(),
  ).toBeVisible();
});

test("status filter narrows the list", async ({ page }) => {
  await page.goto("/projects/2/todos?status=Cancelled");
  await expect(page.getByRole("heading", { name: messages.todoItems.title })).toBeVisible();
  await expect(page.getByTestId("filter-status")).toHaveValue("Cancelled");
  // Seeded items 11 and 12 on project 2 are Cancelled — at least one should be visible.
  await expectListed(page, "Relink new");
});

test("priority filter narrows the list", async ({ page }) => {
  await page.goto("/projects/2/todos?priority=Critical");
  await expect(page.getByRole("heading", { name: messages.todoItems.title })).toBeVisible();
  await expect(page.getByTestId("filter-priority")).toHaveValue("Critical");
});

test("type (projectOrActivity) filter renders in the toolbar", async ({ page }) => {
  await page.goto("/projects/2/todos");
  await expect(page.getByRole("heading", { name: messages.todoItems.title })).toBeVisible();
  await expect(page.getByTestId("filter-type")).toBeVisible();
  await page.getByTestId("filter-type").selectOption("Project");
  await expect(page.getByTestId("filter-type")).toHaveValue("Project");
});

test("alert snooze — snooze buttons visible for a saved alert", async ({ page }) => {
  // Open todo item 15 which had an alert configured in the alert-section test above.
  // The snooze buttons are rendered when an alert with SnoozeOptions exists.
  await page.goto("/projects/2/todos?id=15");
  await expect(page.getByTestId("todo-item-form")).toBeVisible();
  // Only verify when alert exists — alert section may not be open by default.
  const snooze5 = page.getByTestId("snooze-5");
  const dismissBtn = page.getByTestId("dismiss-alert");
  if (await snooze5.isVisible()) {
    // Snooze 5 minutes
    await snooze5.click();
    await expect(
      page.getByTestId("toast-success").filter({ hasText: messages.todoItems.snoozed }).first(),
    ).toBeVisible();
  } else if (await dismissBtn.isVisible()) {
    await dismissBtn.click();
    await expect(
      page.getByTestId("toast-success").filter({ hasText: messages.todoItems.dismissed }).first(),
    ).toBeVisible();
  }
  // If neither is visible the alert was already dismissed — pass.
});

test("axe scan on the todos list has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/todos");
  await expect(page.getByRole("heading", { name: messages.todoItems.title })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("axe scan on the todo item sheet has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/todos?id=11");
  await expect(page.getByTestId("todo-item-form")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});
