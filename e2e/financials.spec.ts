import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";

/**
 * Financials calculator (ADR-0029) on project 2, as e2e-pm (project Manager).
 * One serial story: create from the default template, budget a line in its
 * datasheet cells, watch the recurrent escalation and tax, record invoices in
 * the transactions' new-entry row until the 10 % flag shows,
 * export CSV, add a tax rate change from 2024-2025 (those years re-priced,
 * invoices keep their captured rate), then the guards: a line with invoices can't be deleted and
 * another project's path is not found. Axe on every tab, 360 px without
 * horizontal scroll. Templates: Admins edit (checked when the runner is an
 * Admin), everyone else gets a read-only view.
 */

const M = messages.financials;

test.describe.configure({ mode: "serial" });

let financialUrl = "";
/** A view of the financial under test (the project's Financials menu). */
const view = (tab: "budget" | "monitoring" | "documents" | "settings") =>
  `/projects/2/financials/${tab}?f=${financialUrl.split("/").pop()}`;

async function toast(page: Page, title: string) {
  await expect(page.getByTestId("toast-success").filter({ hasText: title }).first()).toBeVisible();
}

/** A budget line's cell input, by column header and the line's description. */
function lineCell(page: Page, column: string, name: string) {
  return page.getByLabel(messages.datasheet.cellLabel(column, name), { exact: true });
}

function lineRow(page: Page, name: string) {
  return page.getByTestId("budget-line").filter({ has: lineCell(page, M.description, name) });
}

/** A year's cell: its title carries the tax-included amount (and "escalated"). */
function yearCell(page: Page, year: string, name: string) {
  return lineRow(page, name).locator("td", { has: lineCell(page, year, name) });
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
  await page.waitForURL(/\/projects\/2\/financials\/budget\?f=\d+$/);
  financialUrl = `/projects/2/financials/${new URL(page.url()).searchParams.get("f")}`;

  await expect(page.getByTestId("budget-line")).toHaveCount(5);
  await expect(page.getByText("2023-2024 – 2027-2028")).toBeVisible();
  await axe(page);
});

test("budget a recurrent line in its cells: tax per cell, escalation, totals", async ({ page }) => {
  await page.goto(view("budget"));
  const name = "Project management";
  const first = lineCell(page, "2023-2024", name);
  await first.fill("350");
  await first.press("Enter");
  await expect(page.getByText(messages.datasheet.saved("2023-2024"))).toBeAttached();
  await lineCell(page, M.recurrent, name).selectOption({ label: M.recurrentYes });
  await expect(page.getByText(messages.datasheet.saved(M.recurrent))).toBeAttached();

  await expect(yearCell(page, "2023-2024", name)).toHaveAttribute("title", `${M.withTax}: 369.91`);
  await expect(lineCell(page, "2024-2025", name)).toHaveAttribute("placeholder", "367.50");
  await expect(yearCell(page, "2024-2025", name)).toHaveAttribute(
    "title",
    `${M.escalated} · ${M.withTax}: 388.40`,
  );
  // 350 + 367.50 + 385.88 + 405.17 + 425.43 before tax.
  await expect(page.getByTestId("grand-before-tax")).toHaveText("1,933.98");
  await axe(page);

  // The rest of the line is in its sheet, with the same previews.
  await lineRow(page, name)
    .getByRole("button", { name: messages.datasheet.open(name) })
    .click();
  const form = page.getByTestId("line-form");
  await expect(form.getByText(`${M.withTax}: 369.91`)).toBeVisible();
  await closeAlarmToast(page);
  await expect(form.getByLabel("2024-2025")).toHaveAttribute("placeholder", "367.50");
  await axe(page);
  await form.getByRole("button", { name: messages.actions.cancel }).click();
  await expect(form).toHaveCount(0);
});

test("monitor invoices until the line is flagged, then export", async ({ page }) => {
  await page.goto(view("monitoring"));
  await axe(page);
  const add = page.getByTestId("transaction-list").getByTestId("datasheet-add-row");
  const entry = (column: string) =>
    add.getByLabel(messages.datasheet.newEntryField(column), { exact: true });
  for (const [amount, ref] of [
    ["150", "F-1"],
    ["180", "F-2"],
  ]) {
    await entry(M.line).selectOption({ label: "Project management" });
    await entry(M.date).fill("2023-11-01");
    await entry(M.reference).fill(ref);
    await entry(M.amountBeforeTax).fill(amount);
    await add.getByRole("button", { name: messages.datasheet.addEntry }).click();
    const row = page
      .getByTestId("transaction-row")
      .filter({ has: lineCell(page, M.reference, ref) });
    await expect(row.getByTitle(`${M.capturedRate}: 5.6879 %`)).toBeVisible();
  }
  await page
    .getByTestId("monitoring-panel")
    .getByLabel(M.fiscalYear, { exact: true })
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
  await page.goto(view("settings"));
  await axe(page);
  await expect(page.getByLabel(M.budgetIncludesTax)).toBeChecked();
  const form = page.getByTestId("tax-profiles-form");
  const profile = form
    .getByTestId("tax-profile")
    .filter({ has: page.getByLabel(M.removeProfile("Net tax (public body)")) });
  await profile.getByLabel(M.sameRateEveryYear).uncheck();
  const rates = profile.getByTestId("tax-rates");
  await expect(rates.getByLabel(M.rateFor("2023-2024"))).toHaveValue("5.6879");
  for (const year of ["2024-2025", "2025-2026", "2026-2027", "2027-2028"]) {
    await rates.getByLabel(M.rateFor(year)).fill("10");
  }
  await axe(page);
  await form.getByTestId("save-tax-profiles").click();
  await toast(page, messages.feedback.saved);

  await page.goto(view("budget"));
  // 2023-2024 keeps 5.6879 % (369.91); 2024-2025 is 367.50 at 10 % = 404.25.
  await expect(yearCell(page, "2023-2024", "Project management")).toHaveAttribute(
    "title",
    `${M.withTax}: 369.91`,
  );
  await expect(yearCell(page, "2024-2025", "Project management")).toHaveAttribute(
    "title",
    `${M.escalated} · ${M.withTax}: 404.25`,
  );
  await page.goto(view("monitoring"));
  await page
    .getByTestId("monitoring-panel")
    .getByLabel(M.fiscalYear, { exact: true })
    .selectOption({ label: "2023-2024" });
  // 150 and 180 at their captured 5.6879 %: 158.53 + 190.24 = 348.77; budget 369.91.
  await expect(
    page.getByTestId("monitor-line").filter({ hasText: "Project management" }),
  ).toContainText("21.14");
});

test("a currency shows its symbol on the figures, and No symbol takes it away", async ({
  page,
}) => {
  await page.goto(view("settings"));
  const currency = page.getByTestId("currency");
  await expect(currency).toHaveValue("");
  // By value, never by label: the suggested code is also listed under All currencies, and the
  // names come from the platform's ICU data, so a label match breaks on a different runner.
  await currency.selectOption("USD");
  await page.getByTestId("save-breakdown").click();
  // The saved value through a fresh render, not a toast: the toast flake is open, and the lasting
  // effect is what the client asked for.
  await expect(async () => {
    await page.goto(view("settings"));
    await expect(page.getByTestId("currency")).toHaveValue("USD");
  }).toPass({ timeout: 20_000 });

  await page.goto(view("budget"));
  await expect(page.getByTestId("grand-before-tax")).toHaveText(/^\$/);
  await expect(page.getByTestId("grand-with-tax")).toHaveText(/^\$/);

  await page.goto(view("settings"));
  await page.getByTestId("currency").selectOption("");
  await page.getByTestId("save-breakdown").click();
  await expect(async () => {
    await page.goto(view("budget"));
    await expect(page.getByTestId("grand-before-tax")).not.toContainText("$");
  }).toPass({ timeout: 20_000 });
});

test("guards: a line with invoices stays, another project's path is not found", async ({
  page,
}) => {
  await page.goto(view("budget"));
  await lineRow(page, "Project management")
    .getByRole("button", { name: messages.datasheet.open("Project management") })
    .click();
  const remove = page.getByTestId("line-form").getByTestId("delete-line");
  await expect(remove).toBeDisabled();
  await expect(remove).toHaveAttribute("title", M.lineInUse);

  await page.goto(view("settings"));
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
  for (const tab of ["budget", "monitoring", "settings"] as const) {
    await page.goto(view(tab));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, tab).toBeLessThanOrEqual(0);
  }
});

test("templates: Admins edit, others read", async ({ page }) => {
  await page.goto("/settings/financial-templates");
  await page.getByTestId("template-list").getByRole("link").first().click();
  const editor = page.getByTestId("template-editor");
  await expect(editor.getByText(M.taxProfiles, { exact: true })).toBeVisible();
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
