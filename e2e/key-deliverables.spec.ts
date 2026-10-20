import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";
import { escapeRegExp, expectListed } from "./support/datasheet";

/**
 * Key deliverables module (#9) — create happy path, validation failure, the
 * WBS and Gantt editor (ADR-0027: add, indent, rename, drag, stretch, scale,
 * a parent's read-only dates in the datasheet, the sub-item delete warning,
 * delete; desktop + 360 px), the WBS diagram (add, rename, drag and drop,
 * the round trip with the Gantt, keyboard, delete; Alt+arrow moves, Move to…,
 * a branch listed or side by side, zoom), the item menu, status colour and
 * requirements (ADR-0036), and axe scans on the list, the diagram and the Gantt.
 * Runs as e2e-pm (storage state from auth.setup.ts). Project 2 is seeded with
 * deliverables and stakeholders.
 */

const W = messages.keyDeliverables.wbs;

/**
 * A WBS row by its item's id. Outline codes are positions, and other tests add items to
 * project 2 at the same time (each page inserts after the rows it knows), so a code read
 * earlier can name another item by the time it is used.
 */
function wbsRow(page: Page, id: string | null): Locator {
  return page.locator(`li[data-wbs-row="${id}"]`);
}

/** A row's field by its label, whatever the row's code is now ("Start of item 3.1"). */
function wbsField(row: Locator, label: (code: string) => string): Locator {
  return row.getByLabel(new RegExp(`^${escapeRegExp(label(""))}`));
}

/** A row's outline code now. */
async function wbsCode(row: Locator): Promise<string> {
  const label = await wbsField(row, W.nameOf).getAttribute("aria-label");
  return (label ?? "").slice(W.nameOf("").length);
}

/**
 * Selects a WBS box by its corner: a click elsewhere may land on its name (which opens the
 * item's menu), its status chip or its "Add requirement" button (ADR-0036).
 */
async function selectBox(box: Locator): Promise<void> {
  await box.click({ position: { x: 4, y: 4 } });
}

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
  await form.getByLabel(messages.keyDeliverables.deliverable).fill(requirement);
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
  await expect(page.getByText(messages.keyDeliverables.deliverableRequired).first()).toBeVisible();
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
  const parentId = await page
    .locator("li[data-wbs-row]", { has: page.locator("input:focus") })
    .getAttribute("data-wbs-row");
  const parentRow = wbsRow(page, parentId);

  // Add the next item and indent it under the first with Tab while typing its name.
  await page.getByTestId("wbs-add").click();
  const childName = page.locator("input:focus");
  await expect(childName).toHaveValue(W.newItemName, { timeout: 15_000 });
  const childId = await page
    .locator("li[data-wbs-row]", { has: page.locator("input:focus") })
    .getAttribute("data-wbs-row");
  const childRow = wbsRow(page, childId);
  await childName.fill(`E2E task ${stamp}`);
  await childName.press("Tab");
  await expect(wbsField(childRow, W.nameOf)).toHaveValue(`E2E task ${stamp}`);
  // Indented: the child is its parent's first sub-item, whatever their codes are now.
  await expect
    .poll(async () => (await wbsCode(childRow)) === `${await wbsCode(parentRow)}.1`)
    .toBe(true);

  // The first item is now a summary over its sub-item, and the Gantt shows both at once.
  await expect(page.getByTestId(`gantt-bar-${parentId}`)).toHaveAttribute(
    "aria-label",
    new RegExp(W.summaryNote),
  );
  const childBar = page.getByTestId(`gantt-bar-${childId}`);
  await expect(childBar).toBeVisible();

  // Drag the bar three days later: both dates move.
  const startField = wbsField(childRow, W.startOf);
  const endField = wbsField(childRow, W.endOf);
  const start0 = await startField.inputValue();
  const end0 = await endField.inputValue();
  await childBar.scrollIntoViewIfNeeded();
  let box = (await childBar.boundingBox())!;
  // However thin the bar is drawn, it is a 40 px target.
  expect(box.height).toBeGreaterThanOrEqual(40);
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
  await expect(wbsField(parentRow, W.endOf)).toHaveValue(plusDays(end0, 5));

  // Type a date in the outline: the bar follows.
  await startField.fill(plusDays(start0, 10));
  await startField.press("Enter");
  await expect(endField).toHaveValue(plusDays(end0, 12));

  // The edits were saved: they are still there after a reload. Saves are queued, so wait for
  // the queue first (a reload while "Saving" shows asks before dropping the rest).
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(wbsField(childRow, W.nameOf)).toHaveValue(`E2E task ${stamp}`);
  await expect
    .poll(async () => (await wbsCode(childRow)) === `${await wbsCode(parentRow)}.1`)
    .toBe(true);
  await expect(endField).toHaveValue(plusDays(end0, 12));

  // Weeks and months keep the bars, with the dates in the header.
  await page.getByTestId("wbs-scale-week").click();
  await expect(page.getByTestId("wbs-scale-week")).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/scale=week/);
  await expect(page.getByTestId(`gantt-bar-${childId}`)).toBeVisible();
  await page.getByTestId("wbs-scale-month").click();
  await expect(page.getByTestId(`gantt-bar-${childId}`)).toBeVisible();

  // In the list's datasheet a parent's dates are shown, not edited; its sub-item's are edited.
  const KD = messages.keyDeliverables;
  const cell = (column: string, row: string) =>
    page.getByLabel(messages.datasheet.cellLabel(column, row), { exact: true });
  await page.goto(`/projects/2/deliverables?view=list&q=${stamp}`);
  await expect(cell(KD.deadline, `E2E task ${stamp}`)).toBeVisible();
  await expect(cell(KD.startDate, `E2E task ${stamp}`)).toBeVisible();
  await expect(cell(KD.deadline, `E2E phase ${stamp}`)).toHaveCount(0);
  await expect(cell(KD.startDate, `E2E phase ${stamp}`)).toHaveCount(0);

  // Its details warn that deleting it deletes its sub-item too.
  await page.goto(`/projects/2/deliverables?d=${parentId}`);
  await page.getByTestId("deliverable-delete").click();
  await expect(
    page.getByRole("heading", { name: W.deleteTitle(`E2E phase ${stamp}`, 1) }),
  ).toBeVisible();
  await expect(page.getByText(W.deleteBody)).toBeVisible();
  await page.getByRole("button", { name: messages.actions.cancel }).click();

  // Delete the first item: its sub-item goes with it.
  await page.goto("/projects/2/deliverables/gantt?view=gantt&scale=month");
  await wbsField(parentRow, W.nameOf).focus();
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
  // Escape reverts a draft that the saved value has not caught up with yet (DraftInput), so
  // it only leaves the field once the save is back: wait for the box to show the new dates.
  await expect(taskBox).toHaveAttribute("aria-label", /Jun 10, 2027/, { timeout: 15_000 });
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
  await selectBox(phaseBox);
  await page.getByTestId("wbs-rename").click();
  const renamed = page.locator("input:focus");
  await expect(renamed).toHaveValue(`E2E phase ${stamp}`);
  await renamed.fill(`E2E stage ${stamp}`);
  await renamed.press("Enter");
  await expect(phaseBox).toContainText(`E2E stage ${stamp}`);
  // The rename (and the outdent before it) save in the background; a save landing between
  // ArrowDown and the focus check re-renders the boxes and drops the focus.
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

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

  await selectBox(phaseBox);
  await page.getByTestId("wbs-delete").click();
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(phaseBox).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
});

test("WBS diagram: Alt+arrows, Move to…, a branch listed or side by side, zoom", async ({
  page,
}) => {
  const stamp = Date.now();
  await page.goto("/projects/2/deliverables/gantt?view=wbs");
  const diagram = page.getByTestId("wbs-diagram");
  await expect(diagram).toBeVisible();
  await closeAlarmToast(page);

  async function addTopLevel(name: string): Promise<Locator> {
    await page.getByTestId("wbs-add").click();
    const field = page.locator("input:focus");
    await expect(field).toHaveValue(W.newItemName, { timeout: 15_000 });
    await field.fill(name);
    await field.press("Enter");
    const added = diagram.getByRole("treeitem", { name: new RegExp(escapeRegExp(name)) });
    await expect(added).toBeFocused();
    return page.getByTestId(`wbs-box-${await added.getAttribute("data-wbs-box")}`);
  }
  const phase = await addTopLevel(`E2E phase ${stamp}`);
  const task = await addTopLevel(`E2E task ${stamp}`);

  // Alt+→ makes the focused box a sub-item of the one before it, Alt+← takes it back out,
  // and it keeps the focus wherever it lands.
  await page.keyboard.press("Alt+ArrowRight");
  await expect(task).toHaveAttribute("aria-level", "2");
  await expect(task).toBeFocused();
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(task).toHaveAttribute("aria-level", "1");
  await expect(task).toBeFocused();

  // Move to… sends the selected item under any other, without dragging across the chart.
  await page.getByTestId("wbs-move-to").click();
  const dialog = page.getByRole("dialog", { name: new RegExp(`E2E task ${stamp}`) });
  await dialog.getByLabel(W.moveUnder).fill(`E2E phase ${stamp}`);
  await dialog
    .getByRole("listbox")
    .getByRole("option", { name: new RegExp(`E2E phase ${stamp}`) })
    .click();
  await dialog.getByTestId("wbs-move-submit").click();
  await expect(dialog).toBeHidden();
  await expect(task).toHaveAttribute("aria-level", "2");

  // A single sub-item sits under its parent; Listed puts it on a rail, where the top and
  // bottom edges are the drop zones, and Automatic gives the choice back to the width.
  await expect(task).toHaveAttribute("data-wbs-axis", "row");
  await selectBox(phase);
  await page.getByTestId("wbs-sub-items-list").click();
  await expect(task).toHaveAttribute("data-wbs-axis", "column");
  await page.reload();
  await expect(task).toHaveAttribute("data-wbs-axis", "column");
  await selectBox(phase);
  await page.getByTestId("wbs-sub-items-auto").click();
  await expect(task).toHaveAttribute("data-wbs-axis", "row");

  const zoom = page.getByTestId("wbs-zoom-reset");
  await page.getByTestId("wbs-zoom-out").click();
  await expect(zoom).toHaveText("90%");
  await zoom.click();
  await expect(zoom).toHaveText("100%");

  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  await selectBox(phase);
  await page.getByTestId("wbs-delete").click();
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(phase).toHaveCount(0);
  await expect(task).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
});

test("WBS item menu: whole name, status colour; requirements cascade in both views", async ({
  page,
}) => {
  const stamp = Date.now();
  const longName = `E2E deliverable with a name too long for its box to show in two lines ${stamp}`;
  await page.goto("/projects/2/deliverables/gantt?view=wbs");
  const diagram = page.getByTestId("wbs-diagram");
  await expect(diagram).toBeVisible();
  await closeAlarmToast(page);

  await page.getByTestId("wbs-add").click();
  const field = page.locator("input:focus");
  await expect(field).toHaveValue(W.newItemName, { timeout: 15_000 });
  await field.fill(longName);
  await field.press("Enter");
  const item = diagram.getByRole("treeitem", { name: new RegExp(escapeRegExp(longName)) });
  await expect(item).toBeFocused();
  const id = await item.getAttribute("data-wbs-box");
  const box = page.getByTestId(`wbs-box-${id}`);
  const menu = page.getByTestId("wbs-menu");

  // Shift+F10 opens the item's menu with its whole name; Escape gives the focus back.
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await expect(page.getByTestId("wbs-menu-name")).toContainText(longName);
  await expect(page.getByTestId("wbs-menu-add")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(box).toBeFocused();

  // A right-click opens it too; Status sets the status, and the box takes its colour.
  await box.click({ button: "right", position: { x: 4, y: 4 } });
  await expect(menu).toBeVisible();
  await page.getByTestId("wbs-menu-status").click();
  await page.getByTestId("wbs-status-Completed").click();
  await expect(menu).toBeHidden();
  await expect(page.getByTestId(`wbs-status-chip-${id}`)).toHaveText("Completed");
  await expect(box).toHaveClass(/bg-tone-green-soft/);

  // Requirements: add two under the box (the field stays open for the next), tick one.
  await page.getByTestId(`wbs-req-add-${id}`).click();
  const add = page
    .getByLabel(W.newRequirementFor(""), { exact: false })
    .and(page.locator(":focus"));
  await add.fill(`E2E permit ${stamp}`);
  await add.press("Enter");
  await add.fill(`E2E soil report ${stamp}`);
  await add.press("Enter");
  await add.press("Escape");
  const list = page.getByTestId(`wbs-reqs-${id}`);
  await expect(list).toContainText(`E2E permit ${stamp}`, { timeout: 15_000 });
  await expect(list).toContainText(`E2E soil report ${stamp}`, { timeout: 15_000 });
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  await list.getByLabel(W.requirementMet(`E2E permit ${stamp}`)).check();
  await expect(page.getByTestId(`wbs-req-toggle-${id}`)).toHaveText(W.requirementCount(1, 2));

  // The Gantt cascades the same requirements under the item; move the second one up there.
  await page.getByTestId("wbs-view-gantt").click();
  const soil = page.getByLabel(W.editRequirement(`E2E soil report ${stamp}`), { exact: true });
  await expect(soil).toHaveValue(`E2E soil report ${stamp}`);
  await expect(
    page.getByLabel(W.requirementMet(`E2E permit ${stamp}`), { exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: W.moveRequirementUp(`E2E soil report ${stamp}`), exact: true })
    .click();
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

  // Saved: after a reload the order and the tick are still there.
  await page.reload();
  const texts = page.locator(
    `input[aria-label^="${W.editRequirement("E2E ")}"][aria-label$="${stamp}"]`,
  );
  await expect(texts).toHaveCount(2);
  await expect(texts.first()).toHaveValue(`E2E soil report ${stamp}`);
  await expect(texts.last()).toHaveValue(`E2E permit ${stamp}`);
  await expect(page.getByTestId(`wbs-row-status-${id}`)).toHaveText("Completed");

  // Delete a requirement (it asks first), then the item from its menu.
  await page
    .getByRole("button", { name: W.deleteRequirement(`E2E permit ${stamp}`), exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: W.deleteRequirementTitle(`E2E permit ${stamp}`) }),
  ).toBeVisible();
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(texts).toHaveCount(1);

  await wbsField(wbsRow(page, id), W.nameOf).click({ button: "right" });
  await page.getByTestId("wbs-menu-delete").click();
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(wbsRow(page, id)).toHaveCount(0);
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
