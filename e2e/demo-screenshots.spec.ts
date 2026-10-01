/**
 * demo-screenshots.spec.ts
 *
 * Captures a curated set of screenshots from every built module for use in
 * demos, presentations and documentation.  Run standalone — NOT part of the
 * normal e2e suite; excluded from playwright.config.ts testMatch.
 *
 * Prerequisites
 * ─────────────
 * 1. Dev/preview server running at BASE_URL (default http://localhost:3000).
 * 2. SQL Server seeded (db-apply.sh already applied).
 * 3. DEMO_USERNAME  — username to sign in as (default: e2e-pm)
 *    DEMO_PASSWORD  — password for that user (required)
 *
 * Usage
 * ─────
 *   DEMO_USERNAME=e2e-admin DEMO_PASSWORD=changeMe_Str0ng!database \
 *     npx playwright test e2e/demo-screenshots.spec.ts \
 *       --config=playwright.config.ts \
 *       --project=demo-standalone \
 *       --headed
 *
 * Or use the helper script:
 *   bash scripts/capture-demo-screenshots.sh
 *
 * Output
 * ──────
 * PNG files are written to  screenshots/  (git-ignored).
 * File names encode the shot number and subject, e.g.:
 *   01-login.png
 *   02-projects-grid.png
 *   …
 */

import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";

// ─── helpers ────────────────────────────────────────────────────────────────

const OUT = "screenshots";

type Page = import("@playwright/test").Page;
type Browser = import("@playwright/test").Browser;

/** Take a viewport screenshot. */
async function snap(page: Page, name: string) {
  await page.screenshot({
    path: `${OUT}/${name}.png`,
    fullPage: false,
    animations: "disabled",
  });
}

/** Wait for network to settle before capturing. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
}

/** Sign in with DEMO_USERNAME / DEMO_PASSWORD and land on the home page. */
async function signIn(browser: Browser): Promise<Page> {
  const username = process.env.DEMO_USERNAME ?? "e2e-pm";
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("DEMO_PASSWORD must be set to run demo screenshots");

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel(messages.auth.username).fill(username);
  await page.getByLabel(messages.auth.password).fill(password);
  await page.getByRole("button", { name: messages.auth.signIn }).click();
  await page.waitForURL("/");
  return page;
}

// ─── screenshot suite ────────────────────────────────────────────────────────

/**
 * All shots run sequentially in a single authenticated browser context.
 * beforeAll signs in once; the page is shared across all tests via closure.
 * test.describe.serial guarantees order and aborts on first failure.
 */
test.describe.serial("demo screenshots", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await signIn(browser);
    // Default desktop viewport for all non-mobile shots.
    await page.setViewportSize({ width: 1440, height: 1080 });
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  // ── 01  Login page ──────────────────────────────────────────────────────

  test("01 — login page (signed-out)", async ({ browser }) => {
    // Capture the login form using a separate anonymous context.
    const anonCtx = await browser.newContext();
    const anonPage = await anonCtx.newPage();
    await anonPage.goto("/login");
    await expect(
      anonPage.getByRole("heading", { name: messages.auth.loginTitle }),
    ).toBeVisible();
    await settle(anonPage);
    await snap(anonPage, "01-login");
    await anonCtx.close();
  });

  // ── 02  Projects list — grid view ───────────────────────────────────────

  test("02 — projects list (grid view)", async () => {
    await page.setViewportSize({ width: 1440, height: 1080 });
    // Force grid view explicitly so the view-preference cookie doesn't matter.
    await page.goto("/projects?view=grid");
    await expect(page.getByTestId("page-title")).toBeVisible();
    await expect(page.getByTestId("data-view-grid")).toBeVisible();
    await settle(page);
    await snap(page, "02-projects-grid");
  });

  // ── 03  Projects list — table / list view ───────────────────────────────

  test("03 — projects list (table view)", async () => {
    await page.goto("/projects?view=list");
    await expect(page.getByTestId("page-title")).toBeVisible();
    await expect(page.getByTestId("data-view-table")).toBeVisible();
    await settle(page);
    await snap(page, "03-projects-table");
  });

  // ── 04  Project charter workspace ───────────────────────────────────────

  test("04 — project charter (project 2)", async () => {

    // Project 2 is the richest seeded project (Upgrade Inventory Management).
    await page.goto("/projects/2");
    await expect(page.getByTestId("project-form")).toBeVisible();
    await expect(page.getByTestId("project-header")).toBeVisible();
    await settle(page);
    await snap(page, "04-project-charter");
  });

  // ── 05  Project charter — section nav visible (mobile 390 px) ───────────

  test("05 — project charter at 390 px (mobile)", async () => {

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects/2");
    await expect(page.getByTestId("project-form")).toBeVisible();
    await settle(page);
    await snap(page, "05-project-charter-mobile");
  });

  // ── 06  Key deliverables list ────────────────────────────────────────────

  test("06 — key deliverables list (project 2)", async () => {

    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto("/projects/2/deliverables?view=grid");
    await expect(
      page.getByRole("heading", { name: messages.keyDeliverables.title }),
    ).toBeVisible();
    await expect(page.getByTestId("data-view-grid")).toBeVisible();
    await settle(page);
    await snap(page, "06-deliverables-list");
  });

  // ── 07  Gantt chart ──────────────────────────────────────────────────────

  test("07 — Gantt chart (project 2)", async () => {

    await page.goto("/projects/2/deliverables/gantt");
    await expect(
      page.getByRole("heading", { name: messages.keyDeliverables.ganttTitle }),
    ).toBeVisible();
    await expect(page.getByTestId("gantt-chart")).toBeVisible();
    await settle(page);
    await snap(page, "07-gantt-chart");
  });

  // ── 08  Gantt chart — mobile 390 px ─────────────────────────────────────

  test("08 — Gantt chart at 390 px (mobile)", async () => {

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/projects/2/deliverables/gantt");
    await expect(page.getByTestId("gantt-chart")).toBeVisible();
    await settle(page);
    await snap(page, "08-gantt-mobile");
  });

  // ── 09  Deliverable detail sheet open ────────────────────────────────────

  test("09 — deliverable detail sheet open (?d=1)", async () => {

    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto("/projects/2/deliverables?d=1");
    await expect(
      page.getByRole("heading", { name: messages.keyDeliverables.editTitle }),
    ).toBeVisible();
    await settle(page);
    await snap(page, "09-deliverable-sheet");
  });

  // ── 10  Stakeholders list ────────────────────────────────────────────────

  test("10 — stakeholders list (project 2)", async () => {

    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto("/projects/2/stakeholders");
    await expect(
      page.getByRole("heading", { name: messages.stakeholders.title }),
    ).toBeVisible();
    await settle(page);
    await snap(page, "10-stakeholders-list");
  });

  // ── 11  Stakeholder sheet open ───────────────────────────────────────────

  test("11 — stakeholder sheet open (first seeded stakeholder)", async () => {

    // Seeded stakeholders start at id 1; project 2 has stakeholders 1-3.
    await page.goto("/projects/2/stakeholders?id=1");
    await expect(page.getByTestId("stakeholder-form")).toBeVisible();
    await settle(page);
    await snap(page, "11-stakeholder-sheet");
  });

  // ── 12  Suppliers list ───────────────────────────────────────────────────

  test("12 — suppliers list (project 2)", async () => {

    await page.goto("/projects/2/suppliers");
    await expect(
      page.getByRole("heading", { name: messages.suppliers.title }),
    ).toBeVisible();
    await settle(page);
    await snap(page, "12-suppliers-list");
  });

  // ── 13  Objectives list ──────────────────────────────────────────────────

  test("13 — objectives list (project 2)", async () => {

    await page.goto("/projects/2/objectives");
    await expect(
      page.getByRole("heading", { name: messages.objectives.title }),
    ).toBeVisible();
    await settle(page);
    await snap(page, "13-objectives-list");
  });

  // ── 14  Questions & Answers list ─────────────────────────────────────────

  test("14 — questions & answers list (project 2)", async () => {

    await page.goto("/projects/2/questions-answers");
    await expect(
      page.getByRole("heading", { name: messages.questionsAnswers.title }),
    ).toBeVisible();
    await settle(page);
    await snap(page, "14-questions-answers-list");
  });

  // ── 15  Daily activities list ────────────────────────────────────────────

  test("15 — daily activities list (project 2)", async () => {

    await page.goto("/projects/2/daily-activities");
    await expect(
      page.getByRole("heading", { name: messages.dailyActivities.title }),
    ).toBeVisible();
    await settle(page);
    await snap(page, "15-daily-activities-list");
  });

  // ── 16  To-do list ───────────────────────────────────────────────────────

  test("16 — to-do list (project 2)", async () => {

    await page.goto("/projects/2/todos");
    await expect(
      page.getByRole("heading", { name: messages.todoItems.title }),
    ).toBeVisible();
    await settle(page);
    await snap(page, "16-todos-list");
  });

  // ── 17  Dark mode — project charter ─────────────────────────────────────

  test("17 — project charter in dark mode", async () => {

    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto("/projects/2");
    await expect(page.getByTestId("project-form")).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await settle(page);
    await snap(page, "17-project-charter-dark");
  });

  // ── 18  Dark mode — Gantt chart ──────────────────────────────────────────

  test("18 — Gantt chart in dark mode", async () => {

    await page.goto("/projects/2/deliverables/gantt");
    await expect(page.getByTestId("gantt-chart")).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await settle(page);
    await snap(page, "18-gantt-dark");
  });

  // ── 19  New deliverable sheet open ───────────────────────────────────────

  test("19 — new deliverable form (?d=new)", async () => {

    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto("/projects/2/deliverables?d=new");
    await expect(
      page.getByRole("heading", { name: messages.keyDeliverables.newDeliverable }),
    ).toBeVisible();
    await settle(page);
    await snap(page, "19-new-deliverable-form");
  });

  // ── 20  New project form ─────────────────────────────────────────────────

  test("20 — new project form", async () => {

    await page.goto("/projects/new");
    await expect(
      page.getByLabel(messages.projects.name),
    ).toBeVisible();
    await settle(page);
    await snap(page, "20-new-project-form");
  });
});
