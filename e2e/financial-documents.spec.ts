import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";

/**
 * Financial document checklist (ADR-0030) on project 2, as e2e-pm (Manager).
 * One serial story: a financial from the default template carries its nine
 * documents; a budget with no capital amount offers the "non-capitalizable"
 * reason (advisory, one click to use it) and the 200,000 $ rule offers its own;
 * a duplicate name is refused (case-insensitive) before the server; a new
 * required document gets a location attached; copy from the template skips
 * listed names; remove asks first. Then the outputs: print view, PDF and the
 * project CSV. Axe on the tab and the print view; 360 px without sideways
 * scroll.
 */

const M = messages.financials;
const D = M.documents;

test.describe.configure({ mode: "serial" });

let financialUrl = "";

async function toast(page: Page, title: string) {
  await expect(page.getByTestId("toast-success").filter({ hasText: title }).first()).toBeVisible();
}

function card(page: Page, name: string) {
  return page
    .getByTestId(/^document-\d+$/)
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("a financial from the default template lists its documents", async ({ page }) => {
  await page.goto("/projects/2/financials");
  await page.getByTestId("new-financial").click();
  const dialog = page.getByRole("dialog", { name: M.newFinancial });
  await dialog.getByLabel(M.titleLabel).fill(`E2E documents ${Date.now()}`);
  await dialog.getByLabel(M.firstFiscalYear).fill("2023");
  await dialog.getByTestId("create-financial").click();
  await page.waitForURL(/\/projects\/2\/financials\/\d+$/);
  financialUrl = new URL(page.url()).pathname;

  // An operating amount and no capital amount: the cost reads as non-capitalizable.
  await page
    .getByTestId("budget-line")
    .filter({ has: page.getByRole("rowheader", { name: /Project management/ }) })
    .getByRole("button", { name: M.editLine("Project management") })
    .click();
  await page.getByTestId("line-form").getByLabel("2023-2024").fill("1000");
  await page.getByTestId("line-form").getByTestId("save-line").click();
  await toast(page, messages.feedback.saved);

  await page.getByTestId("tab-documents").click();
  await expect(page.getByTestId("documents-panel")).toBeVisible();
  await expect(page.getByTestId(/^document-\d+$/)).toHaveCount(9);
  await expect(page.getByTestId("documents-summary")).toHaveText(D.summary(0, 0, 9));
  await axe(page);
});

test("suggested reasons are offered, and one click uses one", async ({ page }) => {
  await page.goto(`${financialUrl}?tab=documents`);
  const da = card(page, "DA (Dossier d'affaires)");
  await expect(da.getByTestId("document-suggestion")).toContainText(D.matchNoCapital);
  const dO = card(page, "DO (Dossier d'opportunité)");
  await expect(dO.getByTestId("document-suggestion")).toContainText(
    D.matchBudgetBelow("1,056.88", "200,000.00"),
  );

  await da.getByTestId("use-suggestion").click();
  await toast(page, messages.feedback.saved);
  await expect(da.getByTestId("document-required")).toHaveText(D.requiredNo);
  await expect(da.getByTestId("document-reason")).toContainText("non-capitalizable");
  await expect(da.getByTestId("use-suggestion")).toHaveCount(0);
});

test("add a required document, refuse a duplicate, attach a location", async ({ page }) => {
  await page.goto(`${financialUrl}?tab=documents`);
  await page.getByTestId("add-document").click();
  const form = page.getByTestId("document-form");
  await form.getByLabel(D.name, { exact: true }).fill("a1");
  await form.getByTestId("save-document").click();
  await expect(form.getByText(D.nameDuplicate)).toBeVisible();

  await form.getByLabel(D.name, { exact: true }).fill("Bon de commande");
  await form.getByLabel(D.required, { exact: true }).selectOption("yes");
  await form.getByTestId("document-add-suggestion").click();
  await form.getByLabel(D.threshold, { exact: true }).fill("25,000");
  await form
    .getByLabel(D.suggestedReason, { exact: true })
    .fill("Small purchase: no purchase order.");
  await form.getByTestId("save-document").click();
  await toast(page, messages.feedback.created);

  const po = card(page, "Bon de commande");
  await expect(po.getByTestId("document-required")).toHaveText(D.requiredYes);
  // Required: the rule still shows what it found, but offers no one-click reason.
  await expect(po.getByTestId("document-suggestion")).toContainText("Small purchase");
  await expect(po.getByTestId("use-suggestion")).toHaveCount(0);

  await po.getByTestId("attachments-add-location").click();
  await page.getByTestId("attachment-location-name").fill("Signed PO");
  await page.getByTestId("attachment-location-value").fill("\\\\fs01\\finance\\po-1.pdf");
  await page.getByTestId("attachment-dialog-save").click();
  await expect(po.getByTestId("attachment").filter({ hasText: "Signed PO" })).toBeVisible();
  await expect(page.getByTestId("documents-summary")).toHaveText(D.summary(1, 1, 8));
});

test("remove asks first; copying the template skips listed names", async ({ page }) => {
  await page.goto(`${financialUrl}?tab=documents`);
  await card(page, "A1")
    .getByRole("button", { name: D.remove("A1") })
    .click();
  const confirm = page.getByRole("dialog", { name: `${D.remove("A1")}?` });
  await confirm.getByRole("button", { name: D.removeLabel }).click();
  await toast(page, messages.feedback.deleted);
  await expect(card(page, "A1")).toHaveCount(0);

  await page.getByTestId("copy-documents").click();
  await toast(page, D.copied(1));
  await expect(card(page, "A1")).toHaveCount(1);
  await page.getByTestId("copy-documents").click();
  await toast(page, D.copied(0));
  await expect(page.getByTestId(/^document-\d+$/)).toHaveCount(10);
});

test("print view, PDF and project CSV carry the checklist", async ({ page }) => {
  await page.goto(`${financialUrl}/print`);
  await expect(page.getByTestId("financial-print")).toBeVisible();
  await expect(page.getByText("Bon de commande", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Signed PO", { exact: false })).toBeVisible();
  await axe(page);

  const pdf = await page.request.get(`${financialUrl}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["content-disposition"]).toMatch(
    /^attachment; filename="financials-\d+\.pdf"$/,
  );
  const body = (await pdf.body()).toString("latin1");
  expect(body.startsWith("%PDF-1.4")).toBe(true);
  expect(body).toContain("(Bon de commande)");

  const csv = await page.request.get("/projects/2/financials/export");
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(text).toContain("Bon de commande");
  expect(text).toContain(`${D.requiredNo}: No DA or DAS is created`);

  const other = await page.request.get(
    `${financialUrl.replace("/projects/2/", "/projects/1/")}/pdf`,
  );
  expect(other.status()).toBe(404);
});

test("the checklist fits a 360 px screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(`${financialUrl}?tab=documents`);
  await expect(page.getByTestId("documents-panel")).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);
});
