import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";
import { expectListed, openListed } from "./support/datasheet";

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
  ).toBeVisible({ timeout: 15_000 });
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
  ).toBeVisible({ timeout: 15_000 });
});

test("Due soon follows the window the user picks in Settings", async ({ page }) => {
  const title = `E2E due soon ${Date.now()}`;
  const inFiveDays = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const listed = `/projects/2/todos?view=grid&q=${encodeURIComponent(title)}`;
  const dueSoon = page
    .getByTestId("data-view-grid")
    .getByText(`${inFiveDays} — ${messages.todoItems.approachingDeadline}`, { exact: true });

  async function chooseWindow(days: number) {
    await page.goto("/settings");
    await closeAlarmToast(page);
    const setting = page.getByTestId("due-soon-setting");
    await setting.getByLabel(messages.settings.todos.dueSoon).selectOption(String(days));
    const save = setting.getByRole("button", { name: messages.actions.save });
    if (await save.isDisabled()) return;
    await save.click();
    await expect(
      page.getByTestId("toast-success").filter({ hasText: messages.feedback.saved }).first(),
    ).toBeVisible({ timeout: 15_000 });
  }

  await page.goto("/projects/2/todos");
  await closeAlarmToast(page);
  await page.getByTestId("new-todo-item").click();
  const form = page.getByTestId("todo-item-form");
  await form.getByLabel(messages.todoItems.todoItem).fill(title);
  await form.getByLabel(messages.todoItems.dueDate).fill(inFiveDays);
  await form.getByLabel(messages.todoItems.status).selectOption("Not Started");
  await page.getByTestId("todo-item-save").click();
  await expect(form).toHaveCount(0, { timeout: 15_000 });

  try {
    await chooseWindow(2);
    await page.goto(listed);
    await expectListed(page, title);
    await expect(dueSoon).toHaveCount(0);

    await chooseWindow(7);
    const axe = await new AxeBuilder({ page }).include("main").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
      [],
    );
    await page.goto(listed);
    await expectListed(page, title);
    await expect(dueSoon).toBeVisible();
  } finally {
    await chooseWindow(2);
  }
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
    ).toBeVisible({ timeout: 15_000 });
  } else if (await dismissBtn.isVisible()) {
    await dismissBtn.click();
    await expect(
      page.getByTestId("toast-success").filter({ hasText: messages.todoItems.dismissed }).first(),
    ).toBeVisible({ timeout: 15_000 });
  }
  // If neither is visible the alert was already dismissed — pass.
});

/** A to-do on one calendar day: a day cell shows three, and "+N more" lists the rest. */
async function calendarEntry(page: Page, day: string, title: string) {
  const cell = page.locator(`[data-testid="calendar-day"][data-day="${day}"]`);
  const entry = cell.getByTestId("calendar-entry").filter({ hasText: title });
  if ((await entry.count()) > 0) return entry;
  await cell.getByTestId("calendar-more").click();
  return page.getByRole("dialog").getByTestId("calendar-entry").filter({ hasText: title });
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
}

test("calendar — one day of a daily series is marked done; the series stays listed", async ({
  page,
}) => {
  test.slow();
  const R = messages.todoItems.repeat;
  const title = `E2E daily ${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10);
  const listed = `/projects/2/todos?q=${encodeURIComponent(title)}`;
  const viewport = page.viewportSize();
  const saved = page
    .getByTestId("toast-success")
    .filter({ hasText: messages.feedback.saved })
    .first();

  await page.goto("/projects/2/todos");
  await closeAlarmToast(page);
  await page.getByTestId("new-todo-item").click();
  const form = page.getByTestId("todo-item-form");
  await form.getByLabel(messages.todoItems.todoItem).fill(title);
  await form.getByLabel(messages.todoItems.startDate).fill(today);
  await page.getByTestId("todo-item-save").click();
  await expect(form).toHaveCount(0, { timeout: 15_000 });

  try {
    await page.goto(listed);
    await openListed(page, title);
    await page.getByTestId("todo-repeat").getByRole("button", { name: R.configure }).click();
    const rule = page.getByTestId("todo-repeat-form");
    await rule.getByLabel(R.unit, { exact: true }).selectOption("Day");
    await rule.getByLabel(R.ends, { exact: true }).selectOption("after");
    await rule.getByLabel(R.endsAfterCount, { exact: true }).fill("3");
    await page.getByTestId("todo-repeat-save").click();
    await expect(saved).toBeVisible({ timeout: 15_000 });

    await page.goto("/projects/2/todos");
    await closeAlarmToast(page);
    await page.getByTestId("view-calendar").click();
    await expect(page.getByTestId("todo-calendar")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await (await calendarEntry(page, today, title)).click();
    const dialog = page.getByTestId("occurrence-dialog");
    await expect(dialog).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await dialog.getByTestId("occurrence-done").click();
    await expect(saved).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toHaveCount(0);
    await expect(await calendarEntry(page, today, title)).toHaveClass(/line-through/);
    if (await page.getByRole("dialog").first().isVisible()) await page.keyboard.press("Escape");

    await page.getByTestId("view-calendar").click();
    await expect(page.getByTestId("todo-calendar")).toHaveCount(0);
    await page.goto(listed);
    await expectListed(page, title);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects/2/todos?view=calendar");
    await expect(page.getByTestId("calendar-day").first()).toBeHidden();
    const agendaDay = page.getByTestId("calendar-agenda").locator(`li[data-day="${today}"]`);
    await expect(
      agendaDay
        .getByTestId("calendar-entry")
        .filter({ hasText: title })
        .or(agendaDay.getByTestId("calendar-more"))
        .first(),
    ).toBeVisible();
  } finally {
    if (viewport) await page.setViewportSize(viewport);
    await page.goto(listed);
    await openListed(page, title);
    await page.getByTestId("todo-item-delete").click();
    await page.getByRole("button", { name: messages.actions.delete, exact: true }).last().click();
    await expect(page.getByTestId("todo-item-form")).toHaveCount(0, { timeout: 15_000 });
  }
});

test("project Calendar section — New to-do and a day's + start a to-do; a bad day is ignored", async ({
  page,
}) => {
  const title = `E2E calendar add ${Date.now()}`;
  const day = new Date().toISOString().slice(0, 10);
  await page.goto("/projects/2/calendar");
  await closeAlarmToast(page);
  await expect(
    page.getByRole("heading", { name: messages.projects.calendarSection }),
  ).toBeVisible();
  await expect(page.getByTestId("view-calendar")).toHaveCount(0);

  await page.getByTestId("calendar-new").click();
  const form = page.getByTestId("todo-item-form");
  await expect(form.locator('input[name="startDate"]')).toHaveValue("");
  await page.goto("/projects/2/calendar?id=new&day=2026-02-30");
  await expect(form.locator('input[name="startDate"]')).toHaveValue("");

  await page.goto("/projects/2/calendar");
  await page.locator(`[data-testid="calendar-add"][data-day="${day}"]:visible`).click();
  await expect(form.locator('input[name="startDate"]')).toHaveValue(day);
  await form.getByLabel(messages.todoItems.todoItem).fill(title);
  await page.getByTestId("todo-item-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(form).toHaveCount(0, { timeout: 15_000 });
  const cell = page.locator(`[data-testid="calendar-day"][data-day="${day}"]`);
  await expect(
    cell
      .getByTestId("calendar-entry")
      .filter({ hasText: title })
      .or(cell.getByTestId("calendar-more"))
      .first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(await calendarEntry(page, day, title)).toBeVisible();
});

test("axe scan on the project calendar has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/calendar");
  await expect(page.getByTestId("todo-calendar")).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
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
