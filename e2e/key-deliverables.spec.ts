import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";
import { expectListed } from "./support/datasheet";

/**
 * Key deliverables module (#9) — create happy path, validation failure, the
 * WBS and Gantt editor (ADR-0027: add, indent, rename, drag, stretch, scale,
 * delete; desktop + 360 px), the WBS diagram (add, rename, drag and drop,
 * the round trip with the Gantt, keyboard, delete) and axe scans on the list,
 * the diagram and the Gantt.
 * Runs as e2e-pm (storage state from auth.setup.ts). Project 2 is seeded with
 * deliverables and stakeholders.
 */

const W = messages.keyDeliverables.wbs;

/** yyyy-mm-dd, the given number of days after another. */
function plusDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("create deliverable happy path — appears in the list", async ({ page }) => {
  const requirement = `E2E deliverable ${Date.now()}`;
  await page.goto("/projects/2/deliverables?d=new");
  await expect(
    page.getByRole("heading", { name: messages.keyDeliverables.newDeliverable }),
  ).toBeVisible();
  // Scoped to the sheet: the list behind it is a datasheet whose cells carry the same labels.
  const form = page.getByTestId("deliverable-form");
  await form.getByLabel(messages.keyDeliverables.requirement).fill(requirement);
  await form.getByLabel(messages.keyDeliverables.deadline).fill("2027-03-31");
  await page.getByTestId("deliverable-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible();

  await page.goto(`/projects/2/deliverables?q=${encodeURIComponent(requirement)}`);
  await expectListed(page, requirement);
});

test("validation failure — empty requirement shows the inline error", async ({ page }) => {
  await page.goto("/projects/2/deliverables?d=new");
  await page.getByTestId("deliverable-save").click();
  await expect(page.getByText(messages.keyDeliverables.requirementRequired).first()).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: messages.errors.summaryTitle }),
  ).toBeVisible();
});

test("gantt bars open the deliverable's details", async ({ page }) => {
  await page.goto("/projects/2/deliverables/gantt?view=gantt");
  await expect(
    page.getByRole("heading", { name: messages.keyDeliverables.ganttTitle }),
  ).toBeVisible();
  await expect(page.getByTestId("gantt-chart")).toBeVisible();
  const bar = page.getByTestId("gantt-bar-1");
  await expect(bar).toBeVisible();
  await bar.focus();
  await expect(bar).toBeFocused();
  await bar.press("Enter");
  await page.waitForURL(/\/projects\/2\/deliverables\/gantt\?(.*&)?d=1/);
  await expect(
    page.getByRole("heading", { name: messages.keyDeliverables.editTitle }),
  ).toBeVisible();
});

test("gantt renders at 360 px (mobile): outline and chart tabs", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/projects/2/deliverables/gantt?view=gantt");
  await expect(page.getByTestId("gantt-chart")).toBeVisible();
  await page.getByTestId("wbs-tab-chart").click();
  await expect(page.getByTestId("gantt-bar-1")).toBeVisible();
  await page.getByTestId("wbs-tab-outline").click();
  await expect(page.getByTestId("gantt-bar-1")).toBeHidden();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(360);
});

test("WBS: add, indent with Tab, rename, drag, stretch, change scale, delete", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/projects/2/deliverables/gantt?view=gantt&scale=day");
  await expect(page.getByTestId("gantt-chart")).toBeVisible();
  // The seeded overdue alert sits over the bottom-right of the chart, where the bars are dragged.
  await closeAlarmToast(page);

  // Add a top-level item: its name field takes focus with "New item" selected.
  await page.getByTestId("wbs-add").click();
  const parentName = page.locator("input:focus");
  await expect(parentName).toHaveValue(W.newItemName, { timeout: 15_000 });
  await parentName.fill(`E2E phase ${stamp}`);
  await parentName.press("Enter");
  const parentRow = page.locator("li[data-wbs-row]", { has: page.locator("input:focus") });
  const parentId = await parentRow.getAttribute("data-wbs-row");
  const parentLabel = await parentName.getAttribute("aria-label");
  const parentCode = parentLabel!.replace(W.nameOf(""), "");

  // Add the next item and indent it under the first with Tab while typing its name.
  await page.getByTestId("wbs-add").click();
  const childName = page.locator("input:focus");
  await expect(childName).toHaveValue(W.newItemName, { timeout: 15_000 });
  await childName.fill(`E2E task ${stamp}`);
  await childName.press("Tab");
  await expect(page.getByLabel(W.nameOf(`${parentCode}.1`), { exact: true })).toHaveValue(
    `E2E task ${stamp}`,
  );
  const childRow = page.locator("li[data-wbs-row]", {
    has: page.getByLabel(W.nameOf(`${parentCode}.1`), { exact: true }),
  });
  const childId = await childRow.getAttribute("data-wbs-row");

  // The first item is now a summary over its sub-item, and the Gantt shows both at once.
  await expect(page.getByTestId(`gantt-bar-${parentId}`)).toHaveAttribute(
    "aria-label",
    new RegExp(W.summaryNote),
  );
  const childBar = page.getByTestId(`gantt-bar-${childId}`);
  await expect(childBar).toBeVisible();

  // Drag the bar three days later: both dates move.
  const startField = page.getByLabel(W.startOf(`${parentCode}.1`), { exact: true });
  const endField = page.getByLabel(W.endOf(`${parentCode}.1`), { exact: true });
  const start0 = await startField.inputValue();
  const end0 = await endField.inputValue();
  await childBar.scrollIntoViewIfNeeded();
  let box = (await childBar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 3 * 32, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(startField).toHaveValue(plusDays(start0, 3));
  await expect(endField).toHaveValue(plusDays(end0, 3));

  // Stretch its end two days: only the end moves; the summary's end follows.
  await childBar.scrollIntoViewIfNeeded();
  box = (await childBar.boundingBox())!;
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2 + 2 * 32, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(startField).toHaveValue(plusDays(start0, 3));
  await expect(endField).toHaveValue(plusDays(end0, 5));
  await expect(page.getByLabel(W.endOf(parentCode), { exact: true })).toHaveValue(
    plusDays(end0, 5),
  );

  // Type a date in the outline: the bar follows.
  await startField.fill(plusDays(start0, 10));
  await startField.press("Enter");
  await expect(endField).toHaveValue(plusDays(end0, 12));

  // The edits were saved: they are still there after a reload. Saves are queued, so wait for
  // the queue first (a reload while "Saving" shows asks before dropping the rest).
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByLabel(W.nameOf(`${parentCode}.1`), { exact: true })).toHaveValue(
    `E2E task ${stamp}`,
  );
  await expect(page.getByLabel(W.endOf(`${parentCode}.1`), { exact: true })).toHaveValue(
    plusDays(end0, 12),
  );

  // Weeks and months keep the bars, with the dates in the header.
  await page.getByTestId("wbs-scale-week").click();
  await expect(page.getByTestId("wbs-scale-week")).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/scale=week/);
  await expect(page.getByTestId(`gantt-bar-${childId}`)).toBeVisible();
  await page.getByTestId("wbs-scale-month").click();
  await expect(page.getByTestId(`gantt-bar-${childId}`)).toBeVisible();

  // Delete the first item: its sub-item goes with it.
  await page.getByLabel(W.nameOf(parentCode), { exact: true }).focus();
  await page.getByTestId("wbs-delete").click();
  await expect(
    page.getByRole("heading", { name: W.deleteTitle(`E2E phase ${stamp}`, 1) }),
  ).toBeVisible();
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(page.getByTestId(`gantt-bar-${parentId}`)).toHaveCount(0);
  await expect(page.getByTestId(`gantt-bar-${childId}`)).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(page.locator(`li[data-wbs-row="${childId}"]`)).toHaveCount(0);
});

test("WBS diagram: add, rename, drag onto a box, round trip with the Gantt, delete", async ({
  page,
}) => {
  const stamp = Date.now();
  await page.goto("/projects/2/deliverables/gantt");
  const diagram = page.getByTestId("wbs-diagram");
  await expect(diagram).toBeVisible();
  await expect(page.getByTestId("wbs-view-wbs")).toHaveAttribute("aria-pressed", "true");
  await closeAlarmToast(page);

  // Add a top-level item: its box opens its name with "New item" selected. An add waits for
  // the server (there is no optimistic row), which is slow on a cold database.
  await page.getByTestId("wbs-add").click();
  const firstName = page.locator("input:focus");
  await expect(firstName).toHaveValue(W.newItemName, { timeout: 15_000 });
  await firstName.fill(`E2E phase ${stamp}`);
  await firstName.press("Enter");
  const phase = diagram.getByRole("treeitem", { name: new RegExp(`E2E phase ${stamp}`) });
  await expect(phase).toBeFocused();
  const phaseId = await phase.getAttribute("data-wbs-box");
  const phaseBox = page.getByTestId(`wbs-box-${phaseId}`);

  // A second item lands after it, at the same level.
  await page.getByTestId("wbs-add").click();
  const secondName = page.locator("input:focus");
  await expect(secondName).toHaveValue(W.newItemName, { timeout: 15_000 });
  await secondName.fill(`E2E task ${stamp}`);
  await secondName.press("Enter");
  const task = diagram.getByRole("treeitem", { name: new RegExp(`E2E task ${stamp}`) });
  await expect(task).toHaveAttribute("aria-level", "1");
  const taskId = await task.getAttribute("data-wbs-box");
  const taskBox = page.getByTestId(`wbs-box-${taskId}`);

  // Type its dates in the box: a new start keeps the length, a new end changes it.
  await page.getByTestId(`wbs-dates-${taskId}`).click();
  const boxStart = taskBox.locator('input[type="date"]').first();
  const boxEnd = taskBox.locator('input[type="date"]').last();
  await expect(boxStart).toBeFocused();
  await boxStart.fill("2027-06-01");
  await boxStart.press("Enter");
  await boxEnd.fill("2027-06-10");
  await boxEnd.press("Enter");
  await boxEnd.press("Escape");
  await expect(taskBox).toBeFocused();

  // Drag the task onto the middle of the phase: it becomes the phase's sub-item.
  await taskBox.scrollIntoViewIfNeeded();
  const from = (await taskBox.boundingBox())!;
  const to = (await phaseBox.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await expect(phaseBox).toHaveClass(/outline-dashed/);
  await page.mouse.up();
  await expect(taskBox).toHaveAttribute("aria-level", "2");
  await expect(phaseBox).toHaveAttribute("aria-expanded", "true");
  const phaseCode = (await phaseBox.getAttribute("aria-label"))!.split(" ")[0]!;

  // The Gantt shows the same breakdown: the task is item .1 under a summary bar.
  await page.getByTestId("wbs-view-gantt").click();
  await expect(page).toHaveURL(/view=gantt/);
  const taskName = page.getByLabel(W.nameOf(`${phaseCode}.1`), { exact: true });
  await expect(taskName).toHaveValue(`E2E task ${stamp}`);
  await expect(page.getByLabel(W.startOf(`${phaseCode}.1`), { exact: true })).toHaveValue(
    "2027-06-01",
  );
  await expect(page.getByLabel(W.endOf(`${phaseCode}.1`), { exact: true })).toHaveValue(
    "2027-06-10",
  );
  await expect(page.getByTestId(`gantt-bar-${phaseId}`)).toHaveAttribute(
    "aria-label",
    new RegExp(W.summaryNote),
  );

  // Work from the Gantt: outdent the task there, and the diagram follows.
  await taskName.focus();
  await page.getByTestId("wbs-outdent").click();
  await page.getByTestId("wbs-view-wbs").click();
  await expect(taskBox).toHaveAttribute("aria-level", "1");

  // Rename from the toolbar.
  await phaseBox.click();
  await page.getByTestId("wbs-rename").click();
  const renamed = page.locator("input:focus");
  await expect(renamed).toHaveValue(`E2E phase ${stamp}`);
  await renamed.fill(`E2E stage ${stamp}`);
  await renamed.press("Enter");
  await expect(phaseBox).toContainText(`E2E stage ${stamp}`);

  // The keyboard walks the tree: ↓ goes to the next box, and Delete asks first.
  await phaseBox.focus();
  await page.keyboard.press("ArrowDown");
  await expect(taskBox).toBeFocused();
  await page.keyboard.press("Delete");
  await expect(
    page.getByRole("heading", { name: W.deleteTitle(`E2E task ${stamp}`, 0) }),
  ).toBeVisible();
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(taskBox).toHaveCount(0);

  // The changes were saved.
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(phaseBox).toContainText(`E2E stage ${stamp}`);
  await expect(taskBox).toHaveCount(0);

  await phaseBox.click();
  await page.getByTestId("wbs-delete").click();
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(phaseBox).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
});

test("axe scan on the deliverables list has no serious or critical violations", async ({
  page,
}) => {
  await page.goto("/projects/2/deliverables");
  await expect(page.getByRole("heading", { name: messages.keyDeliverables.title })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("axe scan on the WBS diagram has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/deliverables/gantt");
  await expect(page.getByTestId("wbs-diagram")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("axe scan on the Gantt route has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/deliverables/gantt?view=gantt");
  await expect(page.getByTestId("gantt-chart")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});
