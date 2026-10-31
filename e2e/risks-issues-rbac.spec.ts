import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC denial: Viewer is read-only on risks & issues — the mutation controls are
 * hidden AND the server enforces the permission (FORBIDDEN_ROW unit-tested in
 * src/modules/risks-issues/tests/actions.test.ts).
 * Runs with the e2e-viewer storage state (viewer.setup.ts — no new logins).
 */

test("viewer sees no New risk or issue affordance on the list", async ({ page }) => {
  await page.goto("/projects/2/risks-issues");
  await expect(page.getByRole("heading", { name: messages.risksIssues.title })).toBeVisible();
  await expect(page.getByTestId("new-risk-issue")).toHaveCount(0);
});

test("viewer deep-linking ?id=new does not open the create sheet", async ({ page }) => {
  await page.goto("/projects/2/risks-issues?id=new");
  await expect(page.getByRole("heading", { name: messages.risksIssues.title })).toBeVisible();
  await expect(page.getByTestId("risk-issue-form")).toHaveCount(0);
});

test("viewer sheet is read-only — no save or delete, fields disabled", async ({ page }) => {
  await page.goto("/projects/2/risks-issues?id=1");
  const form = page.getByTestId("risk-issue-form");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("risk-issue-save")).toHaveCount(0);
  await expect(page.getByTestId("risk-issue-delete")).toHaveCount(0);
  await expect(form.getByLabel(messages.risksIssues.owner)).toBeDisabled();
});
