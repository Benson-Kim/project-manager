import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC denial: Viewer is read-only on stakeholders — mutation controls are
 * hidden/disabled AND the server enforces the permission (FORBIDDEN
 * unit-tested in src/modules/stakeholders/actions/actions.test.ts).
 * Runs with the e2e-viewer storage state (viewer.setup.ts — no new logins).
 */

test("viewer sees no New stakeholder affordance on the list", async ({ page }) => {
  await page.goto("/stakeholders");
  await expect(page.getByRole("heading", { name: messages.stakeholders.title })).toBeVisible();
  await expect(page.getByTestId("new-stakeholder")).toHaveCount(0);
});

test("viewer deep-linking ?id=new does not open the create sheet", async ({ page }) => {
  await page.goto("/stakeholders?id=new");
  await expect(page.getByRole("heading", { name: messages.stakeholders.title })).toBeVisible();
  await expect(page.getByTestId("stakeholder-form")).toHaveCount(0);
});

test("viewer sheet is read-only — no save or delete, fields disabled", async ({ page }) => {
  await page.goto("/stakeholders?id=1");
  const form = page.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("stakeholder-save")).toHaveCount(0);
  await expect(page.getByTestId("stakeholder-delete")).toHaveCount(0);
  await expect(form.getByLabel(messages.stakeholders.firstName)).toBeDisabled();
});
