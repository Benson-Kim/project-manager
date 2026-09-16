import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC denial (issue #26): Viewer is read-only on projects — mutation
 * controls are hidden/disabled AND the server enforces the permission
 * (FORBIDDEN unit-tested in src/modules/projects/actions/actions.test.ts).
 * Runs with the e2e-viewer storage state (viewer.setup.ts).
 */

test("viewer sees no New project affordance on the list", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: messages.projects.title })).toBeVisible();
  await expect(page.getByTestId("new-project")).toHaveCount(0);
  // Shell sidebar hides New project for roles without projects:create (issue #28).
  await expect(page.getByTestId("shell-new-project")).toHaveCount(0);
});

test("viewer deep-linking /projects/new is redirected to the list", async ({ page }) => {
  await page.goto("/projects/new");
  await page.waitForURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: messages.projects.title })).toBeVisible();
});

test("viewer charter is read-only — no save or delete, fields disabled", async ({ page }) => {
  await page.goto("/projects/2");
  await expect(page.getByTestId("project-form")).toBeVisible();
  await expect(page.getByTestId("project-save")).toHaveCount(0);
  await expect(page.getByTestId("project-delete")).toHaveCount(0);
  await expect(page.getByLabel(messages.projects.name)).toBeDisabled();
});
