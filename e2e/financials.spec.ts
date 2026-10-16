import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Financials calculator (ADR-0029) on project 2, as e2e-pm (project Manager).
 * One serial story: create from the default template, budget a line, watch the
 * recurrent escalation and tax, record invoices until the 10 % flag shows,
 * export CSV, add a tax rate change from 2024-2025 (those years re-priced,
 * invoices keep their captured rate), then the guards: a line with invoices can't be deleted and
 * another project's path is not found. Axe on every tab, 360 px without
 * horizontal scroll. Templates: Admins edit (checked when the runner is an
 * Admin), everyone else gets a read-only view.
 */

const M = messages.financials;

test.describe.configure({ mode: "serial" });

let financialUrl = "";

async function toast(page: Page, title: string) {
  await expect(page.getByTestId("toast-success").filter({ hasText: title }).first()).toBeVisible();
}

function lineRow(page: Page, name: string) {
  return page
    .getByTestId("budget-line")
    .filter({ has: page.getByRole("rowheader", { name: new RegExp(name) }) });
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("create financials from the default template", async ({ page }) => {
  await page.goto("/projects/2/financials");
  await page.getByTestId("new-financial").click();
  const dialog = page.getByRole("dialog", { name: M.newFinancial });
  await dialog.getByLabel(M.titleLabel).fill(`E2E budget ${Date.now()}`);
  await dialog.getByLabel(M.firstFiscalYear).fill("2023");
  await dialog.getByTestId("create-financial").click();
  await page.waitForURL(/\/projects\/2\/financials\/\d+$/);
  financialUrl = new URL(page.url()).pathname;

  await expect(page.getByTestId("budget-line")).toHaveCount(5);
  await expect(page.getByText("2023-2024 – 2027-2028")).toBeVisible();
  await axe(page);
});

test("budget a recurrent line: tax per cell, escalation, totals", async ({ page }) => {
  await page.goto(financialUrl);
  await lineRow(page, "Project management")
    .getByRole("button", { name: M.editLine("Project management") })
    .click();
  const form = page.getByTestId("line-form");
  await form.getByLabel("2023-2024").fill("350");
  await form.getByLabel(M.recurrent).check();
  await expect(form.getByText(`${M.withTax}: 369.91`)).toBeVisible();
  await expect(form.getByLabel("2024-2025")).toHaveAttribute("placeholder", "367.50");
  await axe(page);
  await form.getByTestId("save-line").click();
  await toast(page, messages.feedback.saved);

  const row = lineRow(page, "Project management");
  await expect(row).toContainText("350.00");
  await expect(row).toContainText("369.91");
  await expect(row.locator("td[title]").first()).toHaveAttribute("title", M.escalated);
  await expect(row).toContainText("367.50");
  // 350 + 367.50 + 385.88 + 405.17 + 425.43 before tax.
  await expect(page.getByTestId("grand-before-tax")).toHaveText("1,933.98");
});

test("monitor invoices until the line is flagged, then export", async ({ page }) => {
  await page.goto(`${financialUrl}?tab=monitoring`);
  await axe(page);
  for (const [amount, ref] of [
    ["150", "F-1"],
    ["180", "F-2"],
  ]) {
    await page.getByTestId("add-transaction").click();
    const form = page.getByTestId("transaction-form");
    await form.getByLabel(M.line).selectOption({ label: "Project management" });
    await form.getByLabel(M.date).fill("2023-11-01");
    await form.getByLabel(M.reference).fill(ref);
    await form.getByLabel(M.amountBeforeTax).fill(amount);
    await expect(form.getByText(`${M.capturedRate}: 5.6879 %`)).toBeVisible();
    await form.getByTestId("save-transaction").click();
    await expect(form).toHaveCount(0);
  }
  await page
    .getByTestId("monitoring-panel")
    .getByLabel(M.fiscalYear)
    .selectOption({ label: "2023-2024" });
  const line = page.getByTestId("monitor-line").filter({ hasText: "Project management" });
  await expect(line).toContainText("330.00");
  await expect(line).toContainText("20.00");
  await expect(line).toContainText(M.status.low);

  const href = await page.getByTestId("export-csv").getAttribute("href");
  const csv = await page.request.get(href!);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(csv.headers()["content-disposition"]).toMatch(
    /^attachment; filename="financials-\d+\.csv"$/,
  );
  const body = await csv.text();
  expect(body).toContain("Project management,Operating fund expenditures");
  expect(body).toContain("350.00,369.91");
  expect(body).toContain("F-2");
});

test("a rate change from 2024-2025 re-prices those years only; invoices keep their rate", async ({
  page,
}) => {
  await page.goto(`${financialUrl}?tab=settings`);
  await axe(page);
  await expect(page.getByLabel(M.budgetIncludesTax)).toBeChecked();
  const form = page.getByTestId("tax-profiles-form");
  await form.getByRole("button", { name: `+ ${M.addStep("Net tax (public body)")}` }).click();
  const steps = form.getByTestId("rate-steps");
  await expect(steps.getByLabel(M.fromYear)).toHaveValue("2024");
  await steps.getByLabel(M.rate).fill("10");
  await axe(page);
  await form.getByTestId("save-tax-profiles").click();
  await toast(page, messages.feedback.saved);

  await page.goto(financialUrl);
  const row = lineRow(page, "Project management");
  // 2023-2024 keeps 5.6879 % (369.91); 2024-2025 is 367.50 at 10 % = 404.25.
  await expect(row).toContainText("369.91");
  await expect(row).toContainText("404.25");
  await page.goto(`${financialUrl}?tab=monitoring`);
  await page
    .getByTestId("monitoring-panel")
    .getByLabel(M.fiscalYear)
    .selectOption({ label: "2023-2024" });
  // 150 and 180 at their captured 5.6879 %: 158.53 + 190.24 = 348.77; budget 369.91.
  await expect(
    page.getByTestId("monitor-line").filter({ hasText: "Project management" }),
  ).toContainText("21.14");
});

test("guards: a line with invoices stays, another project's path is not found", async ({
  page,
}) => {
  await page.goto(financialUrl);
  const remove = lineRow(page, "Project management").getByRole("button", {
    name: M.deleteLine("Project management"),
  });
  await expect(remove).toBeDisabled();
  await expect(remove).toHaveAttribute("title", M.lineInUse);

  await page.goto(`${financialUrl}?tab=settings`);
  await page.getByTestId("breakdown-form").getByLabel(M.firstFiscalYear).fill("2024");
  await page.getByTestId("save-breakdown").click();
  await expect(page.getByRole("alert").filter({ hasText: M.yearsInUse })).toBeVisible();

  const id = financialUrl.split("/").pop();
  const other = await page.request.get(`/projects/1/financials/${id}/export`);
  expect(other.status()).toBe(404);
  // The project segment streams (loading.tsx), so the page answers 200 with the not-found view.
  await page.goto(`/projects/1/financials/${id}`);
  await expect(page.getByText(messages.app.notFoundTitle)).toBeVisible();
  await expect(page.getByTestId("budget-planner")).toHaveCount(0);
});

test("the planner never scrolls the page sideways at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const tab of ["", "?tab=monitoring", "?tab=settings"]) {
    await page.goto(`${financialUrl}${tab}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, tab || "budget").toBeLessThanOrEqual(0);
  }
});

test("templates: Admins edit, others read", async ({ page }) => {
  await page.goto("/settings/financial-templates");
  await page.getByTestId("template-list").getByRole("link").first().click();
  const editor = page.getByTestId("template-editor");
  await expect(
    editor.getByLabel(M.taxProfiles).or(editor.getByText(M.taxProfiles)).first(),
  ).toBeVisible();
  await axe(page);
  const isAdmin = (await page.getByTestId("save-template").count()) > 0;
  if (!isAdmin) {
    await expect(editor.getByText(M.templates.adminOnly)).toBeVisible();
    await expect(editor.getByLabel(M.templates.name)).toBeDisabled();
    return;
  }
  await page.goto("/settings/financial-templates/new");
  const name = `E2E template ${Date.now()}`;
  await page.getByLabel(M.templates.name).fill(name);
  await page.getByRole("button", { name: M.addProfile }).click();
  await page.getByLabel(M.profileName).fill("Net tax");
  await page.getByLabel(M.rate).fill("5.6879");
  await page.getByRole("button", { name: M.addLine(M.sections.operating) }).click();
  await page.getByTestId("template-line").getByLabel(M.description).fill("Licences");
  await page.getByTestId("template-line").getByLabel(M.templates.amount).fill("1,200");
  await page.getByTestId("save-template").click();
  await toast(page, M.templates.saved);
  await page.waitForURL(/\/settings\/financial-templates\/\d+$/);
  await expect(page.getByTestId("template-line").getByLabel(M.templates.amount)).toHaveValue(
    "1200.00",
  );
  await page.getByRole("button", { name: messages.actions.delete }).last().click();
  await page.getByRole("dialog").getByRole("button", { name: messages.actions.delete }).click();
  await page.waitForURL(/\/settings\/financial-templates$/);
  await expect(page.getByTestId("template-list")).not.toContainText(name);
});
