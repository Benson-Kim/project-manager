import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_PAGE_SIZE } from "../src/lib/list-params";
import { messages } from "../src/lib/messages";

/**
 * Every register prints its whole list, not the page that is open, and the stakeholder register
 * goes full screen. window.print is stubbed to record what would be printed. Runs as e2e-pm on
 * seeded project 2.
 */

const REGISTERS: ReadonlyArray<readonly [string, string]> = [
  ["/projects", "projects"],
  ["/boards", "boards"],
  ["/daily-activities", "daily-activities"],
  ["/notes", "notes"],
  ["/todo", "todo-items"],
  ["/projects/2/assumptions-constraints", "assumptions-constraints"],
  ["/projects/2/boards", "boards"],
  ["/projects/2/daily-activities", "daily-activities"],
  ["/projects/2/decisions", "decisions"],
  ["/projects/2/deliverables", "key-deliverables"],
  ["/projects/2/keywords", "keywords"],
  ["/projects/2/meetings", "meetings"],
  ["/projects/2/notes", "notes"],
  ["/projects/2/objectives", "objectives"],
  ["/projects/2/parking-lot", "parking-lot"],
  ["/projects/2/questions-answers", "questions-answers"],
  ["/projects/2/requirements", "requirements"],
  ["/projects/2/risks-issues", "risks-issues"],
  ["/projects/2/stakeholders", "stakeholders"],
  ["/projects/2/suppliers", "suppliers"],
  ["/projects/2/todos", "todo-items"],
];

type PrintJob = { rows: number; pager: boolean; search: string };

const ROWS = "[data-print-fit] tbody tr[tabindex]";

async function recordPrints(page: Page) {
  await page.addInitScript((rows) => {
    const w = window as unknown as { printJobs: PrintJob[] };
    w.printJobs = [];
    window.print = () => {
      w.printJobs.push({
        rows: document.querySelectorAll(rows).length,
        pager: document.querySelector('nav[aria-label^="Page "]') !== null,
        search: location.search,
      });
    };
  }, ROWS);
}

const printJobs = (page: Page) =>
  page.evaluate(() => (window as unknown as { printJobs: PrintJob[] }).printJobs);

async function pageCount(page: Page) {
  const pager = page.locator('nav[aria-label^="Page "]');
  if ((await pager.count()) === 0) return 1;
  const label = (await pager.getAttribute("aria-label")) ?? "";
  return Number(/of (\d+)/.exec(label)?.[1] ?? 1);
}

for (const [path, moduleKey] of REGISTERS) {
  test(`${path} offers Print`, async ({ page }) => {
    await page.goto(path);
    const print = page.getByTestId(`${moduleKey}-print`);
    await expect(print).toBeVisible();
    await expect(print).toHaveText(messages.list.print);
  });
}

for (const register of ["objectives", "stakeholders"] as const) {
  test(`Print sends every ${register} row without the pager, then returns to the open page`, async ({
    page,
  }) => {
    await recordPrints(page);
    await page.goto(`/projects/2/${register}?view=list`);
    await expect(page.getByTestId(`${register}-print`)).toBeVisible();
    const pages = await pageCount(page);
    const start = pages > 1 ? 2 : 1;
    if (start > 1) await page.goto(`/projects/2/${register}?view=list&page=2`);
    const shown = await page.locator(ROWS).count();

    await page.getByTestId(`${register}-print`).click();
    await expect.poll(() => printJobs(page).then((jobs) => jobs.length)).toBe(1);
    const [job] = await printJobs(page);
    expect(job?.search).toContain("print=all");
    expect(job?.pager).toBe(false);
    if (pages > 1) expect(job?.rows).toBeGreaterThan(DEFAULT_PAGE_SIZE);
    else expect(job?.rows).toBe(shown);

    await expect(page).not.toHaveURL(/print=/);
    if (start > 1) await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(ROWS)).toHaveCount(shown);
  });
}

type PrintedPage = {
  title: string;
  headers: number;
  rows: number;
  controls: string[];
  wrappedDates: string[];
  unprintedChoices: string[];
};

/** What the page shows under print styles: the shared print rules every page gets. */
const readPrintedPage = (page: Page) =>
  page.evaluate((): PrintedPage => {
    const shown = (el: Element) => el.checkVisibility();
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `#${el.getAttribute("data-testid")}` : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
    const table = document.querySelector("table[data-print-table]");
    const controls = [
      ...document.querySelectorAll(
        'main button:not([data-rich-cell]), main select, main input, main textarea, main a:not(table a), [role="toolbar"], [role="search"], [role="region"][aria-label="Notifications"]',
      ),
    ]
      .filter(shown)
      .map(describe);
    const lines = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    };
    const wrappedDates = [...(table?.querySelectorAll("td, td *") ?? [])]
      .filter((el) => el.childElementCount === 0 && shown(el))
      .filter((el) => /^\d{4}-\d{2}-\d{2}$/.test((el.textContent ?? "").trim()) && lines(el) > 1)
      .map(describe);
    const unprintedChoices = [...(table?.querySelectorAll("select") ?? [])]
      .filter((select) => select.value !== "")
      .filter((select) => {
        const printed = select.nextElementSibling;
        return (
          !printed ||
          !shown(printed) ||
          printed.textContent?.trim() !== select.selectedOptions[0]?.text.trim()
        );
      })
      .map(describe);
    return {
      title: document.querySelector("main h1")?.textContent?.trim() ?? "",
      headers: [...(table?.querySelectorAll("thead th") ?? [])].filter(shown).length,
      rows: [...(table?.querySelectorAll("tbody tr") ?? [])].filter(shown).length,
      controls,
      wrappedDates,
      unprintedChoices,
    };
  });

for (const register of ["objectives", "stakeholders"] as const) {
  test(`printed ${register} show the title and columns, with no buttons, dropdowns or search`, async ({
    page,
  }) => {
    await page.goto(`/projects/2/${register}?view=list`);
    await expect(page.getByTestId(`${register}-print`)).toBeVisible();
    await page.emulateMedia({ media: "print" });

    const printed = await readPrintedPage(page);
    expect(printed.title).not.toBe("");
    expect(printed.headers).toBeGreaterThan(2);
    expect(printed.rows).toBeGreaterThan(0);
    expect(printed.controls).toEqual([]);
    expect(printed.wrappedDates).toEqual([]);
    expect(printed.unprintedChoices).toEqual([]);
  });
}

test("the stakeholder register goes full screen and back", async ({ page }) => {
  await page.goto("/projects/2/stakeholders");
  const button = page.getByTestId("stakeholders-fullscreen");
  const frame = button.locator(
    "xpath=ancestor::div[contains(concat(' ', @class, ' '), ' inset-0 ')]",
  );
  await expect(button).toHaveText(messages.actions.fullscreen);
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(frame).toHaveCount(0);

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(button).toHaveText(messages.actions.exitFullscreen);
  await expect(frame).toHaveCSS("position", "fixed");
  await expect(page.getByTestId("stakeholders-print")).toBeVisible();

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(button).toHaveText(messages.actions.fullscreen);
  await expect(frame).toHaveCount(0);
});
