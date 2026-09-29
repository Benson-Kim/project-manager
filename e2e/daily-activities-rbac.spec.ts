import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC denial: Viewer is read-only on daily activities — mutation controls are
 * hidden AND the server enforces the permission (FORBIDDEN unit-tested in
 * src/modules/daily-activities/actions/actions.test.ts).
 * Runs with the e2e-viewer storage state (viewer.setup.ts — no new logins).
 */

test("viewer sees no New activity affordance on the list", async ({ page }) => {
  await page.goto("/projects/2/daily-activities");
  await expect(page.getByRole("heading", { name: messages.dailyActivities.title })).toBeVisible();
  await expect(page.getByTestId("new-daily-activity")).toHaveCount(0);
});

test("viewer deep-linking ?id=new does not open the create sheet", async ({ page }) => {
  await page.goto("/projects/2/daily-activities?id=new");
  await expect(page.getByRole("heading", { name: messages.dailyActivities.title })).toBeVisible();
  await expect(page.getByTestId("daily-activity-form")).toHaveCount(0);
});

test("viewer sheet is read-only — no save or delete, fields disabled", async ({ page }) => {
  await page.goto("/projects/2/daily-activities?id=1");
  const form = page.getByTestId("daily-activity-form");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("daily-activity-save")).toHaveCount(0);
  await expect(page.getByTestId("daily-activity-delete")).toHaveCount(0);
  await expect(form.getByLabel(messages.dailyActivities.task)).toBeDisabled();
});
