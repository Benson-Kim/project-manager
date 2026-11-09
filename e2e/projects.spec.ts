import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";
import { expectListed } from "./support/datasheet";

/**
 * Projects module (#5) — create happy path, validation failure, the schedule,
 * phase & progress section, type-ahead jump, axe scans. Runs as e2e-pm
 * (storage state from auth.setup.ts).
 */

test("create project happy path — appears in the list", async ({ page }) => {
  const name = `E2E project ${Date.now()}`;
  await page.goto("/projects/new");
  await page.getByLabel(messages.projects.name).fill(name);
  await page.getByTestId("project-save").click();
  // Success navigates to the charter route; wait for the URL change first.
  await page.waitForURL(/\/projects\/\d+/);
  // The project-switcher combobox in the header displays the current project name.
  await expect(page.getByRole("combobox", { name: messages.projects.jumpToProject })).toHaveValue(
    name,
  );
  // Toast is shown after redirect — may already be gone; assert the list instead.
  await page.goto(`/projects?q=${encodeURIComponent(name)}`);
  await expectListed(page, name);
});

test("validation failure — empty name shows inline error and focuses the summary", async ({
  page,
}) => {
  await page.goto("/projects/new");
  await page.getByTestId("project-save").click();
  await expect(page.getByText(messages.projects.nameRequired).first()).toBeVisible();
  const summary = page.getByRole("alert").filter({ hasText: messages.errors.summaryTitle });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
});

test("schedule, phase & progress: a chosen phase and status save, reload and show in the list", async ({
  page,
}) => {
  const P = messages.projects;
  const name = `E2E phase ${Date.now()}`;
  await page.goto("/projects/new");
  const schedule = page.getByRole("region", { name: P.scheduleSection });
  const details = page.getByRole("region", { name: P.detailsSection });
  await expect(schedule).toBeVisible();
  for (const label of [
    P.phase,
    P.status,
    P.startDate,
    P.endDate,
    P.estimatedCompletion,
    P.statusComments,
  ]) {
    await expect(schedule.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(details.getByText(P.priority, { exact: true })).toBeVisible();
  await expect(details.getByText(P.phase, { exact: true })).toHaveCount(0);

  // "None" is the empty choice, then the client's phases.
  const phase = schedule.getByLabel(P.phase, { exact: true });
  await expect(phase).toHaveValue("");
  for (const option of [P.none, "Initiation", "Planning", "Execution", "Closure"]) {
    await expect(phase.getByRole("option", { name: option, exact: true })).toBeAttached();
  }

  await page.getByLabel(P.name).fill(name);
  await phase.selectOption("Planning");
  await schedule.getByLabel(P.status, { exact: true }).selectOption("In progress");
  await page.getByTestId("project-save").click();
  await page.waitForURL(/\/projects\/\d+/);
  await page.reload();
  const saved = page.getByRole("region", { name: P.scheduleSection });
  await expect(saved.getByLabel(P.phase, { exact: true })).toHaveValue("Planning");
  await expect(saved.getByLabel(P.status, { exact: true })).toHaveValue("In progress");

  await page.goto(`/projects?view=list&q=${encodeURIComponent(name)}`);
  await expect(
    page.getByTestId("data-view-table").locator('thead th[data-column="ProjectPhase"]'),
  ).toContainText(P.phase);
  await expect(
    page.getByRole("combobox", { name: messages.datasheet.cellLabel(P.phase, name), exact: true }),
  ).toHaveValue("Planning");
  await page.getByRole("button", { name: messages.list.sortBy(P.phase) }).click();
  await expect(page).toHaveURL(/sort=ProjectPhase/);
});

test("type-ahead suggests seeded projects from the first characters and jumps", async ({
  page,
}) => {
  await page.goto("/projects");
  const search = page.getByTestId("projects-search");
  await search.fill("Up");
  // Debounce is 250 ms + server action; wait generously for the listbox option.
  const option = page.getByRole("option", { name: /Upgrade/ }).first();
  await expect(option).toBeVisible({ timeout: 5000 });
  await option.click();
  await page.waitForURL(/\/projects\/\d+/);
  // The project-switcher combobox shows the project name after navigation.
  await expect(page.getByRole("combobox", { name: messages.projects.jumpToProject })).toHaveValue(
    /Upgrade/,
  );
});

test("axe scan on the projects list has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: messages.projects.title })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("axe scan on the charter workspace has no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/projects/2");
  await expect(page.getByTestId("project-form")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test.describe("project workspace", () => {
  test("deep link shows project-switcher, section nav with Charter current", async ({ page }) => {
    await page.goto("/projects/2");
    // The project-switcher combobox is the header component for project routes.
    const switcher = page.getByRole("combobox", { name: messages.projects.jumpToProject });
    await expect(switcher).toBeVisible();
    // The section nav is grouped; the Charter link carries aria-current="page".
    const nav = page.getByRole("navigation", { name: messages.projects.sectionsNav });

    // ADR-0019: the Overview group has exactly one section (Charter). It renders
    // as a plain <Link> pill — not a disclosure button — so there is no
    // aria-expanded. The Charter link itself carries aria-current="page".
    const charter = nav.getByRole("link", { name: messages.projects.charterSection });
    await expect(charter).toHaveAttribute("aria-current", "page");
    await expect(charter).toHaveAttribute("href", "/projects/2");

    // The Planning group (≥2 sections) renders as a disclosure button.
    const planningBtn = nav.getByRole("button", { name: messages.planning.title });
    await expect(planningBtn).toBeVisible();
    await expect(planningBtn).toHaveAttribute("aria-expanded", "false");

    // ADR-0046: Requirements is its own group with one section, so it is a pill
    // link straight to the register — not a disclosure, and no longer under Planning.
    const requirements = nav.getByRole("link", { name: messages.projects.requirementsSection });
    await expect(requirements).toHaveAttribute("href", "/projects/2/requirements");
    await expect(
      nav.getByRole("button", { name: messages.projects.requirementsSection }),
    ).toHaveCount(0);

    // The page h1 stays the section name (PageHeader), not the project name.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      messages.projects.charterSection,
    );
  });

  test("section menus stay closed until their group is clicked", async ({ page }) => {
    await page.goto("/projects/2/deliverables");
    const nav = page.getByRole("navigation", { name: messages.projects.sectionsNav });
    const planningBtn = nav.getByRole("button", { name: messages.planning.title });
    const panel = page.getByRole("group", { name: messages.planning.title });

    // The current section's group is not opened over the page on load.
    await expect(planningBtn).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toHaveCount(0);

    await planningBtn.click();
    await expect(planningBtn).toHaveAttribute("aria-expanded", "true");
    await expect(
      panel.getByRole("link", { name: messages.projects.deliverablesSection }),
    ).toHaveAttribute("aria-current", "page");

    await page.getByRole("heading", { level: 1 }).click();
    await expect(panel).toHaveCount(0);
    await expect(planningBtn).toHaveAttribute("aria-expanded", "false");
  });

  test("team cog: a manager grants a section permission per person, then resets it (ADR-0024)", async ({
    page,
  }) => {
    await page.goto("/projects/2");
    await closeAlarmToast(page);
    const team = page.getByTestId("assignee-list");
    const P = messages.projects.permissions;
    const open = async () => {
      await team
        .getByRole("button", { name: messages.projects.permissionsFor("E2E Contributor") })
        .click();
      const dialog = page.getByRole("dialog", { name: P.title("E2E Contributor") });
      await expect(dialog).toBeVisible();
      return dialog;
    };
    const deleteParkingLot = (dialog: import("@playwright/test").Locator) =>
      dialog.getByRole("combobox", { name: P.cell(P.delete, messages.projects.parkingLotSection) });

    let dialog = await open();
    await deleteParkingLot(dialog).selectOption("allow");
    await dialog.getByTestId("permissions-save").click();
    await expect(dialog).toBeHidden();

    dialog = await open();
    await expect(deleteParkingLot(dialog)).toHaveValue("allow");
    await dialog.getByRole("button", { name: P.reset }).click();
    await dialog.getByTestId("permissions-save").click();
    await expect(dialog).toBeHidden();
  });

  test("a section link inside a group panel navigates (portalled panel is not 'outside')", async ({
    page,
  }) => {
    await page.goto("/projects/2");
    const nav = page.getByRole("navigation", { name: messages.projects.sectionsNav });
    await nav.getByRole("button", { name: messages.planning.title }).click();
    await page.getByRole("link", { name: messages.projects.parkingLotSection }).click();
    await expect(page).toHaveURL(/\/projects\/2\/parking-lot$/);
  });

  test.describe("at 360px", () => {
    test.use({ viewport: { width: 360, height: 740 } });

    test("section nav is visible without horizontal page overflow; axe clean", async ({ page }) => {
      await page.goto("/projects/2");
      await expect(page.getByTestId("project-section-nav")).toBeVisible();
      await expect(page.getByTestId("project-form")).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) =>
        ["serious", "critical"].includes(v.impact ?? ""),
      );
      expect(serious).toEqual([]);
    });
  });

  test("unsaved changes guard intercepts client-side link navigation", async ({ page }) => {
    await page.goto("/projects/2");
    await expect(page.getByTestId("project-form")).toBeVisible();
    // Exact and scoped: the team grid's controls are named after "E2E Project Manager".
    const manager = page
      .getByTestId("project-form")
      .getByLabel(messages.projects.manager, { exact: true });
    await manager.fill("Guard Probe");
    // Navigate away via the sidebar Projects link — the guard intercepts it.
    await page
      .getByRole("navigation", { name: messages.app.menu })
      .getByRole("link", { name: messages.projects.title })
      .click();
    // The click is intercepted: still on the charter, confirm dialog shown.
    const dialog = page.getByRole("dialog", { name: messages.feedback.unsavedChangesTitle });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: messages.actions.cancel }).click();
    await expect(manager).toHaveValue("Guard Probe");
    await expect(page).toHaveURL(/\/projects\/2$/);
  });
});

test("business case: Do Nothing sits before the alternatives, saves and reopens", async ({
  page,
}) => {
  const P = messages.projects;
  await page.goto("/projects/new");
  await page.getByLabel(P.name).fill(`E2E do nothing ${Date.now()}`);
  const businessCase = page.getByTestId("project-business-case");
  await businessCase.getByRole("button", { name: P.businessCaseSection }).click();
  const top = async (label: string) =>
    (await businessCase.getByText(label, { exact: true }).first().boundingBox())?.y ?? NaN;
  const objectives = await top(P.objectiveAlignment);
  const doNothing = await top(P.doNothing);
  expect(objectives).toBeLessThan(doNothing);
  expect(doNothing).toBeLessThan(await top(P.alternativeSolutions));

  const editor = businessCase.getByRole("textbox", { name: P.doNothing, exact: true });
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await editor.click();
  await page.keyboard.type("Costs keep rising");
  await page.getByTestId("project-save").click();
  await page.waitForURL(/\/projects\/\d+/);
  await page.reload();
  const saved = page.getByTestId("project-business-case");
  await expect(saved.getByRole("button", { name: P.businessCaseSection })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(saved.getByRole("textbox", { name: P.doNothing, exact: true })).toContainText(
    "Costs keep rising",
    { timeout: 15_000 },
  );
});

test("financing: the PO / Requisition and Requisition dropdowns replace the switches, save and reopen", async ({
  page,
}) => {
  const P = messages.projects;
  await page.goto("/projects/new");
  await page.getByLabel(P.name).fill(`E2E po status ${Date.now()}`);
  const financing = page.getByRole("region", { name: P.financingSection });
  const po = financing.getByLabel(P.poRequisitionStatus, { exact: true });
  const requisition = financing.getByLabel(P.requisitionStatus, { exact: true });
  await expect(financing.getByRole("switch", { name: "Purchase order" })).toHaveCount(0);
  await expect(financing.getByRole("switch", { name: "Requisition" })).toHaveCount(0);
  await expect(po).toHaveValue("");
  for (const option of [P.none, "Draft", "Submitted", "Approved", "Invoiced"]) {
    await expect(po.getByRole("option", { name: option, exact: true })).toBeAttached();
  }
  for (const option of [P.none, "Draft", "Submitted", "Approved", "Sent for Approval"]) {
    await expect(requisition.getByRole("option", { name: option, exact: true })).toBeAttached();
  }

  await po.selectOption("Invoiced");
  await requisition.selectOption("Sent for Approval");
  await page.getByTestId("project-save").click();
  await page.waitForURL(/\/projects\/\d+/);
  await page.reload();
  const saved = page.getByRole("region", { name: P.financingSection });
  await expect(saved.getByLabel(P.poRequisitionStatus, { exact: true })).toHaveValue("Invoiced");
  await expect(saved.getByLabel(P.requisitionStatus, { exact: true })).toHaveValue(
    "Sent for Approval",
  );
});
