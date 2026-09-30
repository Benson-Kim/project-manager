import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC denial: Viewer is read-only on suppliers — mutation controls are
 * hidden/disabled AND the server enforces the permission (FORBIDDEN
 * unit-tested in src/modules/suppliers/actions/actions.test.ts).
 * Runs with the e2e-viewer storage state (viewer.setup.ts — no new logins).
 */

test("viewer sees no New supplier affordance on the list", async ({ page }) => {
  await page.goto("/projects/2/suppliers");
  await expect(page.getByRole("heading", { name: messages.suppliers.title })).toBeVisible();
  await expect(page.getByTestId("new-supplier")).toHaveCount(0);
});

test("viewer deep-linking ?id=new does not open the create sheet", async ({ page }) => {
  await page.goto("/projects/2/suppliers?id=new");
  await expect(page.getByRole("heading", { name: messages.suppliers.title })).toBeVisible();
  await expect(page.getByTestId("supplier-form")).toHaveCount(0);
});

test("viewer sheet is read-only — no save or delete, fields disabled", async ({ page }) => {
  await page.goto("/projects/2/suppliers?id=1");
  const form = page.getByTestId("supplier-form");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("supplier-save")).toHaveCount(0);
  await expect(page.getByTestId("supplier-delete")).toHaveCount(0);
  await expect(form.getByLabel(messages.suppliers.supplierName)).toBeDisabled();
});
