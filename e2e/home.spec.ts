import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";

test("the dashboard shows the to-do calendar and adds a to-do on a day", async ({ page }) => {
  test.slow();
  const title = `E2E dashboard ${Date.now()}`;
  const day = new Date().toISOString().slice(0, 10);
  await page.goto("/");
  await closeAlarmToast(page);
  await expect(page.getByRole("heading", { name: messages.home.title })).toBeVisible();
  await expect(page.getByTestId("todo-calendar")).toBeVisible();
  await expect(page.getByTestId("view-calendar")).toHaveCount(0);

  await page.locator(`[data-testid="calendar-add"][data-day="${day}"]:visible`).click();
  const form = page.getByTestId("todo-item-form");
  await expect(form).toBeVisible();
  await expect(form.locator('input[name="startDate"]')).toHaveValue(day);
  await expect(form.locator('input[name="dueDate"]')).toHaveValue(day);
  await form.getByLabel(messages.todoItems.todoItem).fill(title);
  await page.getByTestId("todo-item-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(form).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]day=/);
  await expect(
    page
      .locator(`[data-day="${day}"]`)
      .getByText(title)
      .or(page.getByTestId("calendar-more"))
      .first(),
  ).toBeVisible();
});

test("PWA manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const manifest = await res.json();
  expect(manifest.name).toBe("Modulus");
});
