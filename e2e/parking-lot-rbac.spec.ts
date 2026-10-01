import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC denial: Viewer is read-only on parking lot — mutation controls are
 * hidden/disabled AND the server enforces the permission (FORBIDDEN
 * unit-tested in src/modules/parking-lot/actions/actions.test.ts).
 * Runs with the e2e-viewer storage state (viewer.setup.ts — no new logins).
 * Route: /projects/2/parking-lot (project-scoped; no standalone route).
 */

test("viewer sees no New item affordance on the list", async ({ page }) => {
  await page.goto("/projects/2/parking-lot");
  await expect(page.getByRole("heading", { name: messages.parkingLot.title })).toBeVisible();
  await expect(page.getByTestId("new-parking-lot-item")).toHaveCount(0);
});

test("viewer deep-linking ?id=new does not open the create sheet", async ({ page }) => {
  await page.goto("/projects/2/parking-lot?id=new");
  await expect(page.getByRole("heading", { name: messages.parkingLot.title })).toBeVisible();
  await expect(page.getByTestId("parking-lot-form")).toHaveCount(0);
});

test("viewer sheet is read-only — no save or delete, fields disabled", async ({ page }) => {
  await page.goto("/projects/2/parking-lot?id=3");
  const form = page.getByTestId("parking-lot-form");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("parking-lot-save")).toHaveCount(0);
  await expect(page.getByTestId("parking-lot-delete")).toHaveCount(0);
  await expect(form.getByLabel(messages.parkingLot.item)).toBeDisabled();
});
