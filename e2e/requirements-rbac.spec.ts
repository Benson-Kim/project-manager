import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC denial: a Viewer reads the requirement register and changes nothing — no new-entry row,
 * no editable cell, no merge, no save or delete, and ?id=new opens nothing. The server enforces
 * the same rule (usp_Requirement_* through usp_Project_AssertAccess; unit-tested in
 * src/modules/requirements/tests/actions.test.ts).
 * Runs with the e2e-viewer storage state (viewer.setup.ts — no new logins).
 */

const M = messages.requirements;
const REGISTER = "/projects/2/requirements?view=list";

test("viewer sees no New requirement affordance and no new-entry row", async ({ page }) => {
  await page.goto(REGISTER);
  await expect(page.getByRole("heading", { name: M.title })).toBeVisible();
  await expect(page.getByTestId("new-requirement")).toHaveCount(0);
  await expect(page.getByTestId("datasheet-add-row")).toHaveCount(0);
  await expect(page.getByTestId("requirements-merge")).toHaveCount(0);
});

test("viewer deep-linking ?id=new does not open the create sheet", async ({ page }) => {
  await page.goto("/projects/2/requirements?id=new");
  await expect(page.getByRole("heading", { name: M.title })).toBeVisible();
  await expect(page.getByTestId("requirement-form")).toHaveCount(0);
});

test("viewer cells are read-only text, not inputs", async ({ page }) => {
  await page.goto(REGISTER);
  await expect(page.getByRole("heading", { name: M.title })).toBeVisible();
  await expect(page.getByRole("textbox", { name: new RegExp(`^${M.requirement}, `) })).toHaveCount(
    0,
  );
  await expect(page.getByRole("combobox", { name: new RegExp(`^${M.met}, `) })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: new RegExp(`^${M.type}, `) })).toHaveCount(0);
});
