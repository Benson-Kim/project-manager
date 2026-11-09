import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { quadrantOf, type Stance } from "../src/modules/stakeholders/matrix";

/**
 * Stakeholder matrix on project 2, as e2e-pm. Each test makes its own stakeholders through the
 * sheet, so places set here never touch the seeded rows or another test's dots.
 */

const S = messages.stakeholders;
const LIST = "/projects/2/stakeholders";
const MATRIX = "/projects/2/stakeholders/matrix";

interface Place {
  power: number;
  interest: number;
  stance: Stance;
}

async function createStakeholder(page: Page, firstName: string, place?: Place): Promise<void> {
  await page.goto(`${LIST}?id=new`);
  const form = page.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();
  await form.getByLabel(S.firstName).fill(firstName);
  if (place) {
    await form.getByLabel(S.power, { exact: true }).fill(String(place.power));
    await form.getByLabel(S.interest, { exact: true }).fill(String(place.interest));
    await form
      .getByLabel(S.stance, { exact: true })
      .selectOption({ label: S.stances[place.stance] });
  }
  await page.getByTestId("stakeholder-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(form).toHaveCount(0);
}

function label(name: string, power: number, interest: number, stance: Stance): string {
  return [
    name,
    `${S.power} ${power}`,
    `${S.interest} ${interest}`,
    S.matrix.quadrants[quadrantOf(power, interest)],
    S.stances[stance],
  ].join(", ");
}

/** The dot found by name, then pinned by its test id, since its name changes as it moves. */
async function dotOf(page: Page, name: string): Promise<Locator> {
  const dot = page.getByTestId("matrix-grid").locator(`[aria-label^="${name},"]`);
  await expect(dot).toHaveCount(1);
  const testId = await dot.getAttribute("data-testid");
  expect(testId).toMatch(/^matrix-dot-\d+$/);
  return page.getByTestId(testId!);
}

function rowOf(page: Page, name: string): Locator {
  return page
    .getByTestId("matrix-register")
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
}

function countSaves(page: Page): { count: number } {
  const saves = { count: 0 };
  page.on("response", (response) => {
    const request = response.request();
    if (request.method() === "POST" && request.postData()?.includes('"stakeholderId"')) {
      saves.count += 1;
    }
  });
  return saves;
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("the stakeholders page links to the matrix and the matrix links back", async ({ page }) => {
  await page.goto(LIST);
  await page.getByTestId("matrix-link").click();
  await expect(page).toHaveURL(MATRIX);
  await expect(page.getByRole("heading", { name: S.matrix.title })).toBeVisible();
  await page.getByTestId("list-link").click();
  await expect(page).toHaveURL(LIST);
  await expect(page.getByRole("heading", { name: S.title })).toBeVisible();
});

test("a dot is named by its place, quadrant and stance, and the register derives the quadrant", async ({
  page,
}) => {
  const name = `E2E matrix dot ${Date.now()}`;
  await createStakeholder(page, name, { power: 85, interest: 30, stance: "Critic" });
  await page.goto(MATRIX);

  const dot = await dotOf(page, name);
  await expect(dot).toHaveAttribute("aria-label", label(name, 85, 30, "Critic"));
  await expect(rowOf(page, name)).toContainText(S.matrix.quadrants.satisfied);
  await expect(page.getByTestId("matrix-alignment")).toContainText(/\d+%/);
  await expect(page.getByTestId("matrix-detractors")).toContainText(/\d+/);
  await expect(page.getByTestId("matrix-coverage")).toContainText(/\d+%/);
  await expect(page.getByTestId("matrix-detractor-share")).toContainText(/\d+\.\d%/);
  await expect(page.getByTestId("matrix-detractor-share")).toContainText(/\d+ of \d+ pts/);
  await expect(page.getByTestId("matrix-champions")).toContainText(/\d+/);
  await expect(page.getByTestId("matrix-unplanned")).toContainText(/\d+/);
  await expect(page.getByTestId("matrix-by-stance")).toContainText(S.stances.Critic);

  await dot.click();
  await expect(dot).toHaveAttribute("aria-pressed", "true");

  await rowOf(page, name).getByRole("link", { name, exact: true }).click();
  const form = page.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();
  await expect(form.getByLabel(S.firstName)).toHaveValue(name);
  await expect(form.getByLabel(S.power, { exact: true })).toHaveValue("85");
});

test("arrow keys move a dot in steps of five, every move is saved and survives a reload", async ({
  page,
}) => {
  const name = `E2E matrix move ${Date.now()}`;
  await createStakeholder(page, name, { power: 35, interest: 45, stance: "Supporter" });
  await page.goto(MATRIX);
  const saves = countSaves(page);
  const dot = await dotOf(page, name);

  await dot.press("ArrowRight");
  await dot.press("ArrowRight");
  await dot.press("ArrowRight");
  await expect(dot).toHaveAttribute("aria-label", label(name, 35, 60, "Supporter"));
  await expect.poll(() => saves.count).toBe(3);

  await dot.press("Shift+ArrowUp");
  await expect(dot).toHaveAttribute("aria-label", label(name, 45, 60, "Supporter"));
  await expect.poll(() => saves.count).toBe(4);
  await expect(page.getByTestId("toast-error")).toHaveCount(0);
  await expect(rowOf(page, name)).toContainText(S.matrix.quadrants.informed);

  await page.reload();
  await expect(await dotOf(page, name)).toHaveAttribute(
    "aria-label",
    label(name, 45, 60, "Supporter"),
  );
  await expect(rowOf(page, name)).toContainText(S.matrix.quadrants.informed);
});

test("a move on a stale version is refused and the matrix shows the newer place", async ({
  page,
}) => {
  const name = `E2E matrix stale ${Date.now()}`;
  await createStakeholder(page, name, { power: 70, interest: 70, stance: "Champion" });
  await page.goto(MATRIX);
  const dot = await dotOf(page, name);
  const id = (await dot.getAttribute("data-testid"))!.replace("matrix-dot-", "");

  const other = await page.context().newPage();
  await other.goto(`${LIST}?id=${id}`);
  const form = other.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();
  await form.getByLabel(S.power, { exact: true }).fill("80");
  await other.getByTestId("stakeholder-save").click();
  await expect(
    other.getByTestId("toast-success").filter({ hasText: messages.feedback.saved }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await other.close();

  await dot.press("ArrowRight");
  await expect(
    page.getByTestId("toast-error").filter({ hasText: messages.errors.CONFLICT }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(dot).toHaveAttribute("aria-label", label(name, 80, 70, "Champion"));
});

test("an unplaced stakeholder is listed under Not placed and opens in the sheet", async ({
  page,
}) => {
  const name = `E2E matrix unplaced ${Date.now()}`;
  await createStakeholder(page, name);
  await page.goto(MATRIX);

  await expect(page.getByTestId("matrix-grid").locator(`[aria-label^="${name},"]`)).toHaveCount(0);
  await page.getByTestId("matrix-not-placed").getByRole("link", { name, exact: true }).click();
  const form = page.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();
  await expect(form.getByLabel(S.firstName)).toHaveValue(name);
});

test("Copy CSV puts the register on the clipboard", async ({ page }) => {
  const name = `E2E matrix csv ${Date.now()}`;
  await createStakeholder(page, name, { power: 85, interest: 30, stance: "Critic" });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copied?: string }).copied = text;
        },
      },
    });
  });
  await page.goto(MATRIX);
  await page.getByTestId("matrix-copy-csv").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: S.matrix.copied }).first(),
  ).toBeVisible();

  const csv = await page.evaluate(() => (window as unknown as { copied?: string }).copied ?? "");
  const cells = (values: readonly (string | number)[]) => values.map((v) => `"${v}"`).join(",");
  const lines = csv.split("\n");
  expect(lines[0]).toBe(
    cells([
      S.name,
      S.projectRole,
      S.stance,
      S.power,
      S.interest,
      S.matrix.quadrant,
      S.keyMessageStrategy,
    ]),
  );
  expect(lines).toContain(
    cells([name, "", S.stances.Critic, 85, 30, S.matrix.quadrants.satisfied, ""]),
  );
});

test("the matrix passes axe in light and dark and fits a 360 px screen", async ({ page }) => {
  await page.goto(MATRIX);
  await expect(page.getByTestId("matrix-grid")).toBeVisible();
  await axe(page);
  // A reload sets the theme before paint; a live switch would scan colours mid-transition.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByTestId("matrix-grid")).toBeVisible();
  await axe(page);

  await page.setViewportSize({ width: 360, height: 800 });
  await page.reload();
  await expect(page.getByTestId("matrix-grid")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
