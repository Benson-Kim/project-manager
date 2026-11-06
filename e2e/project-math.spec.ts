import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";

/**
 * Project math on project 2, as e2e-pm: the cards open from the Financials menu, send a result to
 * the quick calculator, keep what was typed while filtered out, take a picked currency and fit a
 * phone. Axe in light and dark.
 */

const M = messages.financials.projectMath;
const EV = M.earnedValue;
const URL = "/projects/2/financials/project-math";

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

function card(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

test("opens from the Financials menu with every card", async ({ page }) => {
  await page.goto("/projects/2/financials");
  await page
    .getByRole("button", { name: messages.projects.financialsSection, exact: true })
    .click();
  await page.getByRole("link", { name: M.title, exact: true }).click();
  await page.waitForURL(/\/projects\/2\/financials\/project-math/);
  await expect(page.getByRole("heading", { name: M.title, level: 1 })).toBeVisible();
  await expect(page.locator("section[aria-label]")).toHaveCount(10);
  await expect(card(page, EV.name).getByTestId("ev-cpi")).toHaveText("0.85");
});

for (const scheme of ["light", "dark"] as const) {
  test(`axe: every card is clean (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(URL);
    await expect(card(page, EV.name)).toBeVisible();
    await axe(page);
  });
}

test("a card result goes into the calculator's sum", async ({ page }) => {
  await page.goto(URL);
  await closeAlarmToast(page);
  await card(page, EV.name)
    .getByRole("button", { name: new RegExp(`^${EV.useCpi}\\b`) })
    .click();
  const panel = page.getByTestId("quick-calculator-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel(messages.financials.quickCalculator.sum)).toHaveValue(
    "0.8461538462",
  );
  await expect(
    page.getByTestId("toast-info").filter({ hasText: M.sent(EV.useCpi, "0.85") }),
  ).toBeVisible();
  await axe(page);
});

test("a filtered-out card keeps what was typed", async ({ page }) => {
  await page.goto(URL);
  const filters = page.getByRole("group", { name: M.filters, exact: true });
  const ev = card(page, EV.name);
  await ev.getByLabel(EV.bac).fill("260000");

  await filters.getByRole("button", { name: M.categories.money, exact: true }).click();
  await expect(filters.getByRole("button", { name: M.categories.money })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(ev).toBeHidden();
  await expect(card(page, M.percent.name)).toBeVisible();

  await filters.getByRole("button", { name: M.all, exact: true }).click();
  await expect(ev).toBeVisible();
  await expect(ev.getByLabel(EV.bac)).toHaveValue("260000");
});

test("a picked currency shows its symbol on the figures", async ({ page }) => {
  await page.goto(URL);
  const currency = page.getByRole("group", { name: M.currency, exact: true });
  await currency.getByRole("button", { name: "EUR", exact: true }).click();
  await expect(currency.getByRole("button", { name: "EUR", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("cost-total")).toHaveText(/^−?€/);
  await currency.getByRole("button", { name: "GBP", exact: true }).click();
  await expect(page.getByTestId("cost-total")).toHaveText(/^−?£/);
});

test("the cards never scroll the page sideways at 360 px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(URL);
  await expect(card(page, EV.name)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
