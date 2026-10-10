import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC denial for key deliverables (#9): Viewer is read-only — mutation
 * controls are hidden AND the server enforces the permission (FORBIDDEN
 * unit-tested in src/modules/key-deliverables/actions/actions.test.ts).
 * Runs with the e2e-viewer storage state (viewer.setup.ts).
 */

test("viewer sees no New deliverable affordance on the list", async ({ page }) => {
  await page.goto("/projects/2/deliverables");
  await expect(page.getByRole("heading", { name: messages.keyDeliverables.title })).toBeVisible();
  await expect(page.getByTestId("new-deliverable")).toHaveCount(0);
});

test("viewer deep-linking ?d=new does not open the create sheet", async ({ page }) => {
  await page.goto("/projects/2/deliverables?d=new");
  await expect(page.getByRole("heading", { name: messages.keyDeliverables.title })).toBeVisible();
  await expect(page.getByTestId("deliverable-form")).toHaveCount(0);
});

test("viewer deliverable sheet is read-only — no save or delete, fields disabled", async ({
  page,
}) => {
  await page.goto("/projects/2/deliverables?d=1");
  await expect(page.getByTestId("deliverable-form")).toBeVisible();
  await expect(page.getByTestId("deliverable-save")).toHaveCount(0);
  await expect(page.getByTestId("deliverable-delete")).toHaveCount(0);
  await expect(
    page.getByTestId("deliverable-form").getByLabel(messages.keyDeliverables.requirement),
  ).toBeDisabled();
});
