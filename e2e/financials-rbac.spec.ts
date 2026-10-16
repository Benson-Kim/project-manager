import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * RBAC (ADR-0029) as e2e-viewer: financials are read-only for Viewers — no
 * create, no line or transaction controls, settings disabled — and master
 * templates are read-only for anyone but an Admin. The procs refuse the writes
 * too (FORBIDDEN_ROW; .agent-scratch/financials/proc-check.cjs locally).
 * Seeded financial 1 belongs to project 2.
 */

const M = messages.financials;

test("viewer reads financials without write controls", async ({ page }) => {
  await page.goto("/projects/2/financials");
  await expect(page.getByRole("heading", { name: M.title })).toBeVisible();
  await expect(page.getByTestId("new-financial")).toHaveCount(0);

  await page.goto("/projects/2/financials/1");
  await expect(page.getByTestId("budget-planner")).toBeVisible();
  await expect(page.getByTestId("add-line-operating")).toHaveCount(0);
  await expect(page.getByRole("button", { name: messages.actions.edit })).toHaveCount(0);

  await page.goto("/projects/2/financials/1?tab=monitoring");
  await expect(page.getByTestId("add-transaction")).toHaveCount(0);
  await expect(page.getByTestId("export-csv")).toBeVisible();

  await page.goto("/projects/2/financials/1?tab=settings");
  await expect(page.getByTestId("save-breakdown")).toHaveCount(0);
  await expect(page.getByTestId("delete-financial")).toHaveCount(0);
  await expect(page.getByLabel(M.titleLabel)).toBeDisabled();
});

test("viewer reads templates but cannot create one", async ({ page }) => {
  await page.goto("/settings/financial-templates");
  await expect(page.getByTestId("new-template")).toHaveCount(0);
  await page.goto("/settings/financial-templates/new");
  await expect(page.getByText(messages.app.notFoundTitle)).toBeVisible();
  await expect(page.getByTestId("template-editor")).toHaveCount(0);
});
