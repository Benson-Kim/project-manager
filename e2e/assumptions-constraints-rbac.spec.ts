import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC denial: Viewer is read-only on assumptions & constraints — mutation
 * controls are hidden/disabled AND the server enforces the permission
 * (FORBIDDEN unit-tested in actions/actions.test.ts).
 * Runs with the e2e-viewer storage state (viewer.setup.ts — no new logins).
 */

test("viewer sees no New item affordance on the list", async ({ page }) => {
  await page.goto("/projects/2/assumptions-constraints");
  await expect(
    page.getByRole("heading", { name: messages.assumptionsConstraints.title }),
  ).toBeVisible();
  await expect(page.getByTestId("new-assumption-constraint")).toHaveCount(0);
});

test("viewer deep-linking ?id=new does not open the create sheet", async ({ page }) => {
  await page.goto("/projects/2/assumptions-constraints?id=new");
  await expect(
    page.getByRole("heading", { name: messages.assumptionsConstraints.title }),
  ).toBeVisible();
  await expect(page.getByTestId("assumption-constraint-form")).toHaveCount(0);
});

test("viewer sheet is read-only — no save or delete, fields disabled", async ({ page }) => {
  await page.goto("/projects/2/assumptions-constraints?id=1");
  const form = page.getByTestId("assumption-constraint-form");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("assumption-constraint-save")).toHaveCount(0);
  await expect(page.getByTestId("assumption-constraint-delete")).toHaveCount(0);
  await expect(form.getByLabel(messages.assumptionsConstraints.description)).toBeDisabled();
});
