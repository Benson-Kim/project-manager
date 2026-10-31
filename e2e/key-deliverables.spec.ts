import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { formatDate } from "../src/lib/format";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";
import { escapeRegExp, expectListed } from "./support/datasheet";

// These editors mutate the same seeded project's tree. Run this file's tests in order so one
// test's refresh cannot replace another test's focused new item while it is being renamed.
test.describe.configure({ mode: "default" });

/**
 * Key deliverables module (#9) — create happy path, validation failure, the
 * WBS and Gantt editor (ADR-0027: add, indent, rename, drag, stretch, scale,
 * a parent's read-only dates in the datasheet, the sub-item delete warning,
 * delete; desktop + 360 px), the WBS diagram (add, rename, drag and drop,
 * the round trip with the Gantt, keyboard, delete; Alt+arrow moves, Move to…,
 * a branch listed or side by side, zoom), the item menu and requirements (ADR-0036),
 * and axe scans on the list, the diagram and the Gantt.
 * Runs as e2e-pm (storage state from auth.setup.ts). Project 2 is seeded with
 * deliverables and stakeholders.
 */

const W = messages.keyDeliverables.wbs;

/**
 * Adds an item (or a milestone) from the Gantt's toolbar: the details panel's name opens on it
 * with "New item" selected. Items are found by id from then on: outline codes are positions, and
 * other tests add items to project 2 at the same time.
 */
async function addInGantt(page: Page, name: string, testId = "wbs-add"): Promise<string> {
  await page.getByTestId(testId).click();
  const field = page.locator("input[data-wbs-details-name]:focus");
  await expect(field).toHaveValue(W.newItemName, { timeout: 15_000 });
  const id = (await field.getAttribute("data-wbs-details-name"))!;
  await field.fill(name);
  await field.press("Enter");
  if (testId === "wbs-add-milestone") {
    await expect(ganttMilestone(page, id)).toHaveAttribute(
      "aria-label",
      new RegExp(escapeRegExp(name)),
    );
  } else {
    await expect(page.getByTestId(`gantt-card-${id}-name`)).toContainText(name);
  }
  return id;
}

/** A milestone's diamond: the button that selects, nudges and drags it. */
function ganttMilestone(page: Page, id: string): Locator {
  return page.getByTestId(`gantt-milestone-${id}`).getByRole("button");
}

/** Selects a Gantt card and waits for the details panel to show it. */
async function selectCard(page: Page, id: string): Promise<void> {
  await page.getByTestId(`gantt-card-${id}-name`).click();
  await expect(page.locator(`[data-wbs-details-name="${id}"]`)).toBeVisible();
}

/**
 * Picks an entry from a card's menu, opened from the keyboard, and waits for what it opens. The
 * refresh after a save can eat the menu key or move the card and close its menu before the pick
 * lands, so the pick is retried until `opens` shows; `label` checks what the entry reads first.
 */
async function pickFromGanttMenu(
  page: Page,
  handle: Locator,
  entry: string,
  opens: Locator,
  label?: string,
): Promise<void> {
  await expect(async () => {
    if (!(await opens.isVisible())) {
      await handle.focus();
      await page.keyboard.press("Shift+F10");
      const item = page.getByTestId(entry);
      if (label) await expect(item).toHaveText(label, { timeout: 2_000 });
      await item.click({ timeout: 2_000 });
    }
    await expect(opens).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/** Drags a point sideways by the given pixels, in steps, as a person would. */
async function dragBy(page: Page, target: Locator, dx: number): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, y, { steps: 8 });
  await page.mouse.up();
}

/** Whether two elements' boxes overlap on the page. */
async function overlaps(a: Locator, b: Locator): Promise<boolean> {
  const [p, q] = [(await a.boundingBox())!, (await b.boundingBox())!];
  return p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
}

/** Presses a toolbar toggle on. A click before hydration does nothing, so it is retried. */
async function turnOn(toggle: Locator): Promise<void> {
  await expect(async () => {
    if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/** The boxes start with name and code only; this shows their dates, status and work. */
async function showBoxDetails(page: Page): Promise<void> {
  await turnOn(page.getByTestId("wbs-details-toggle"));
}

/** The boxes start without their people; this shows who is on each, or "Unassigned". */
async function showPeople(page: Page): Promise<void> {
  await turnOn(page.getByTestId("wbs-people"));
}

/** Selects a box by its corner, clear of its name, status chip and buttons. */
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
  ).toBeVisible({ timeout: 15_000 });

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

test("gantt cards open the deliverable's details", async ({ page }) => {
  await page.goto("/projects/2/deliverables/gantt?view=gantt");
  await expect(
    page.getByRole("heading", { name: messages.keyDeliverables.ganttTitle }),
  ).toBeVisible();
  await expect(page.getByTestId("gantt-board")).toBeVisible();
  // The first item is a card's name, a lane label or a pill, by what sits under it.
  const item = page.locator("[data-gantt-handle], button[data-gantt-item]").first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.getByTestId("wbs-details-panel")).toBeVisible();
  await expect(page.getByTestId("wbs-details-name")).toHaveValue(/.+/);
});

test("gantt renders at 360 px (mobile) without a sideways page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/projects/2/deliverables/gantt?view=gantt");
  await expect(page.getByTestId("gantt-board")).toBeVisible();
  await expect(page.locator("[data-gantt-item]").first()).toBeAttached();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(360);
});

test("Gantt: add, indent, rename, drag, stretch, change scale, delete", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/projects/2/deliverables/gantt?view=gantt&scale=day");
  await expect(page.getByTestId("gantt-board")).toBeVisible();
  // The seeded overdue alert sits over the bottom-right of the chart, where the cards are dragged.
  await closeAlarmToast(page);

  // Two top-level items, then the second goes under the first from the toolbar.
  const parentId = await addInGantt(page, `E2E phase ${stamp}`);
  const childId = await addInGantt(page, `E2E task ${stamp}`);
  await page.getByTestId("wbs-indent").click();

  // The first item is now the pill of a group, and its sub-item is item .1 on a card beside it.
  const pill = page.getByTestId(`gantt-group-${parentId}-pill`);
  const childName = page.getByTestId(`gantt-card-${childId}-name`);
  await expect(pill).toBeVisible();
  const childIsFirst = async () => {
    const code = (await pill.textContent())!.trim().split(" ")[0];
    return (await childName.textContent())!.startsWith(`${code}.1`);
  };
  await expect.poll(childIsFirst).toBe(true);

  // A parent's dates come from its sub-items: its details show them without a field.
  await pill.click();
  await expect(page.locator(`[data-wbs-details-name="${parentId}"]`)).toBeVisible();
  await expect(page.getByTestId("wbs-details-start")).toHaveCount(0);
  const rolledEnd = page
    .getByTestId("wbs-details-panel")
    .locator("div")
    .filter({ hasText: messages.keyDeliverables.rolledUp(messages.keyDeliverables.deadline) })
    .last();

  // Drag the card's name three days later: both dates move.
  await selectCard(page, childId);
  const startField = page.getByTestId("wbs-details-start");
  const endField = page.getByTestId("wbs-details-end");
  const start0 = await startField.inputValue();
  const end0 = await endField.inputValue();
  await dragBy(page, childName, 3 * 32);
  await expect(startField).toHaveValue(plusDays(start0, 3));
  await expect(endField).toHaveValue(plusDays(end0, 3));
  await expect(page.getByTestId(`gantt-card-${childId}-dates`)).toHaveText(
    `${plusDays(start0, 3)} – ${plusDays(end0, 3)}`,
  );

  // Stretch its right edge two days: only the end moves; the parent's end follows.
  await dragBy(page, page.getByTestId(`gantt-card-${childId}-end`), 2 * 32);
  await expect(startField).toHaveValue(plusDays(start0, 3));
  await expect(endField).toHaveValue(plusDays(end0, 5));
  await pill.click();
  await expect(rolledEnd).toContainText(formatDate(plusDays(end0, 5)));

  // Type a date in the details: the card follows.
  await selectCard(page, childId);
  await startField.fill(plusDays(start0, 10));
  await startField.press("Enter");
  await expect(endField).toHaveValue(plusDays(end0, 12));
  await expect(page.getByTestId(`gantt-card-${childId}-dates`)).toHaveText(
    `${plusDays(start0, 10)} – ${plusDays(end0, 12)}`,
  );

  // The edits were saved: they are still there after a reload. Saves are queued, so wait for
  // the queue first (a reload while "Saving" shows asks before dropping the rest).
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(childName).toContainText(`E2E task ${stamp}`);
  await expect.poll(childIsFirst).toBe(true);
  await expect(page.getByTestId(`gantt-card-${childId}-dates`)).toHaveText(
    `${plusDays(start0, 10)} – ${plusDays(end0, 12)}`,
  );

  // Weeks and months keep the cards.
  await page.getByTestId("wbs-scale-week").click();
  await expect(page.getByTestId("wbs-scale-week")).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/scale=week/);
  await expect(childName).toBeVisible();
  await page.getByTestId("wbs-scale-month").click();
  await expect(childName).toBeVisible();

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

  // Delete the first item: its sub-item goes with it. The toolbar's Delete stays disabled until
  // something is selected, and a click before hydration selects nothing: click until it comes alive.
  await page.goto("/projects/2/deliverables/gantt?view=gantt&scale=month");
  const toolbarDelete = page.getByTestId("wbs-delete");
  await expect(async () => {
    await pill.click();
    await expect(toolbarDelete).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await toolbarDelete.click();
  await expect(
    page.getByRole("heading", { name: W.deleteTitle(`E2E phase ${stamp}`, 1) }),
  ).toBeVisible();
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(pill).toHaveCount(0);
  await expect(childName).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByTestId("gantt-board")).toBeVisible();
  await expect(childName).toHaveCount(0);
});

test("Gantt: Escape cancels a drag; a card dropped on another lane moves under its item", async ({
  page,
}) => {
  const stamp = Date.now();
  await page.goto("/projects/2/deliverables/gantt?view=gantt&scale=day");
  await expect(page.getByTestId("gantt-board")).toBeVisible();
  await closeAlarmToast(page);
  const saving = page.getByTestId("wbs-saving");

  // A phase with a sub-item (a pill over its own lane), then a top-level card after it.
  const phaseId = await addInGantt(page, `E2E lane phase ${stamp}`);
  const subId = await addInGantt(page, `E2E lane sub ${stamp}`);
  await page.getByTestId("wbs-indent").click();
  const pill = page.getByTestId(`gantt-group-${phaseId}-pill`);
  await expect(pill).toBeVisible();
  await pill.click();
  const looseId = await addInGantt(page, `E2E lane loose ${stamp}`);
  await expect(saving).toBeHidden({ timeout: 15_000 });
  const phaseLane = page.locator(`[data-gantt-lane="${phaseId}"]`);
  await expect(phaseLane.getByTestId(`gantt-card-${subId}`)).toBeVisible();
  const loose = page.getByTestId(`gantt-card-${looseId}-name`);
  const looseDates = page.getByTestId(`gantt-card-${looseId}-dates`);
  const dates0 = await looseDates.textContent();

  // Escape while dragging puts the card back where it was.
  await loose.scrollIntoViewIfNeeded();
  // Scrolled into view, the card is clear of the tools floating over the chart's foot.
  expect(await overlaps(loose, page.getByTestId("gantt-tools"))).toBe(false);
  let box = (await loose.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 2 * 32, box.y + box.height / 2, { steps: 6 });
  await expect(looseDates).not.toHaveText(dates0!);
  await page.keyboard.press("Escape");
  await expect(looseDates).toHaveText(dates0!);
  await page.mouse.up();
  await expect(looseDates).toHaveText(dates0!);

  // Straight up onto the phase's lane: the lane is marked while the card is over it, and the
  // drop makes the card the phase's last sub-item, on the same dates.
  await loose.scrollIntoViewIfNeeded();
  box = (await loose.boundingBox())!;
  const lane = (await phaseLane.boundingBox())!;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, lane.y + lane.height / 2, { steps: 10 });
  await expect(phaseLane).toHaveAttribute("data-drop-target", "true");
  await page.mouse.up();
  await expect(phaseLane.getByTestId(`gantt-card-${looseId}`)).toBeVisible();
  await expect(phaseLane).not.toHaveAttribute("data-drop-target", "true");
  await expect(looseDates).toHaveText(dates0!);
  const phaseCode = (await pill.textContent())!.trim().split(" ")[0];
  await expect(loose).toContainText(`${phaseCode}.2`);

  // Undo takes the move back.
  await page.getByTestId("wbs-undo").click();
  await expect(phaseLane.getByTestId(`gantt-card-${looseId}`)).toHaveCount(0);
  await expect(loose).toBeVisible();
  await expect(saving).toBeHidden({ timeout: 15_000 });

  // Clean up: the phase (with its sub-item), then the loose card.
  for (const select of [() => pill.click(), () => selectCard(page, looseId)]) {
    await select();
    await page.getByTestId("wbs-delete").click();
    await page.getByRole("button", { name: W.delete, exact: true }).last().click();
    await expect(saving).toBeHidden({ timeout: 15_000 });
  }
  await expect(pill).toHaveCount(0);
  await expect(loose).toHaveCount(0);
});

test("Gantt tools: Add, Copy summary, Display settings that last, and a print that fits", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const stamp = Date.now();
  const name = `E2E tools ${stamp}`;
  await page.goto("/projects/2/deliverables/gantt?view=gantt");
  await expect(page.getByTestId("gantt-board")).toBeVisible();
  await closeAlarmToast(page);
  const tools = page.getByTestId("gantt-tools");
  await expect(tools).toBeVisible();

  // Add from the bar's menu: the same add as the toolbar's, its name open in the details.
  await tools.getByTestId("gantt-tools-add").click();
  await expect(page.getByTestId("gantt-tools-add-item")).toBeFocused();
  const id = await addInGantt(page, name, "gantt-tools-add-item");
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

  // Copy summary: the plan as text, this item on its own line with its progress and dates.
  await tools.getByTestId("gantt-tools-copy").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: W.board.summaryCopied }).first(),
  ).toBeVisible();
  const summary = await page.evaluate(() => navigator.clipboard.readText());
  expect(summary).toMatch(
    new RegExp(String.raw`^ *\d+ ${escapeRegExp(name)}: \d+%, \d{4}-\d{2}-\d{2}`, "m"),
  );

  // Display: a setting is a checkbox that keeps the menu open, and it lasts past a reload.
  const dates = page.getByTestId(`gantt-card-${id}-dates`);
  await expect(dates).toBeVisible();
  await tools.getByTestId("gantt-tools-display").click();
  const showDates = page.getByTestId("gantt-show-dates");
  await expect(showDates).toHaveAttribute("aria-checked", "true");
  await showDates.click();
  await expect(showDates).toHaveAttribute("aria-checked", "false");
  await expect(showDates).toBeVisible();
  await expect(dates).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(showDates).toBeHidden();
  await page.reload();
  await expect(page.getByTestId(`gantt-card-${id}-name`)).toBeVisible();
  await expect(dates).toHaveCount(0);
  await tools.getByTestId("gantt-tools-display").click();
  await showDates.click();
  await expect(dates).toBeVisible();
  await page.keyboard.press("Escape");

  // Printing: the chart is measured and shrunk to the page if it is wider; the tools stay off it.
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const zoom = await page
    .getByTestId("gantt-board")
    .evaluate((el) => Number(el.style.getPropertyValue("--print-zoom")));
  expect(zoom).toBeGreaterThan(0);
  expect(zoom).toBeLessThanOrEqual(1);
  await page.emulateMedia({ media: "print" });
  await expect(tools).toBeHidden();
  await expect(page.getByTestId("gantt-board")).toHaveCSS("overflow-x", "visible");
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(tools).toBeVisible();

  await selectCard(page, id);
  await page.getByTestId("wbs-delete").click();
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(page.getByTestId(`gantt-card-${id}`)).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
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
  await showBoxDetails(page);

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
  await expect(taskBox).toHaveAttribute("aria-label", /2027-06-10/, { timeout: 15_000 });
  await boxEnd.press("Escape");
  await expect(taskBox).toBeFocused();

  // Drag the task by its grip onto the middle of the phase: it becomes the phase's sub-item. The
  // middle of a box with details on is its buttons, which never start a drag.
  await taskBox.scrollIntoViewIfNeeded();
  const from = (await taskBox.locator("[data-wbs-grip]").boundingBox())!;
  const to = (await phaseBox.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await expect(phaseBox).toHaveClass(/outline-dashed/);
  await page.mouse.up();
  await expect(taskBox).toHaveAttribute("aria-level", "2");
  await expect(phaseBox).toHaveAttribute("aria-expanded", "true");
  const phaseCode = (await phaseBox.getAttribute("aria-label"))!.split(" ")[0]!;

  // The Gantt shows the same breakdown: the phase is a group's pill, the task its item .1.
  await page.getByTestId("wbs-view-gantt").click();
  await expect(page).toHaveURL(/view=gantt/);
  await expect(page.getByTestId(`gantt-group-${phaseId}-pill`)).toContainText(
    `${phaseCode} E2E phase ${stamp}`,
  );
  const taskName = page.getByTestId(`gantt-card-${taskId}-name`);
  await expect(taskName).toContainText(`${phaseCode}.1`);
  await expect(taskName).toContainText(`E2E task ${stamp}`);
  await expect(page.getByTestId(`gantt-card-${taskId}-dates`)).toHaveText(
    "2027-06-01 – 2027-06-10",
  );

  // Work from the Gantt: its details read the task; outdent it there, and the diagram follows.
  await selectCard(page, taskId!);
  await expect(page.getByTestId("wbs-details-name")).toHaveValue(`E2E task ${stamp}`);
  await expect(page.getByTestId("wbs-details-start")).toHaveValue("2027-06-01");
  await expect(page.getByTestId("wbs-details-end")).toHaveValue("2027-06-10");
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

  // A sub-item is listed on a rail under its parent, where the top and bottom edges are the drop
  // zones; Horizontal (in the parent's details) puts it side by side under it, Automatic leaves it
  // to the width (one sub-item always fits), and Vertical lists it again.
  await expect(task).toHaveAttribute("data-wbs-axis", "column");
  await selectBox(phase);
  const panel = page.getByTestId("wbs-details-panel");
  await panel.getByTestId("wbs-sub-items-row").click();
  await expect(task).toHaveAttribute("data-wbs-axis", "row");
  // A reload while the move is still saving asks to leave the page, and the reload never lands.
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(task).toHaveAttribute("data-wbs-axis", "row");
  await selectBox(phase);
  await panel.getByTestId("wbs-sub-items-list").click();
  await expect(task).toHaveAttribute("data-wbs-axis", "column");
  await panel.getByTestId("wbs-sub-items-auto").click();
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

test("WBS: Undo move takes back a move and a reschedule, from the button or Ctrl+Z", async ({
  page,
}) => {
  test.slow();
  const stamp = Date.now();
  const name = `E2E undo ${stamp}`;
  await page.goto("/projects/2/deliverables/gantt?view=wbs");
  const diagram = page.getByTestId("wbs-diagram");
  await expect(diagram).toBeVisible();
  await closeAlarmToast(page);
  const undo = page.getByTestId("wbs-undo");
  const saving = page.getByTestId("wbs-saving");

  async function addTopLevel(text: string): Promise<Locator> {
    await page.getByTestId("wbs-add").click();
    const field = page.locator("input:focus");
    await expect(field).toHaveValue(W.newItemName, { timeout: 15_000 });
    await field.fill(text);
    await field.press("Enter");
    const added = diagram.getByRole("treeitem", { name: new RegExp(escapeRegExp(text)) });
    await expect(added).toBeFocused();
    return added;
  }
  const leadId = await (await addTopLevel(`E2E undo lead ${stamp}`)).getAttribute("data-wbs-box");
  const item = await addTopLevel(name);
  const id = await item.getAttribute("data-wbs-box");
  await expect(saving).toBeHidden({ timeout: 15_000 });
  // Adding is not a move: there is nothing to take back yet.
  await expect(undo).toBeDisabled();

  // The button takes back a keyboard move.
  await page.keyboard.press("Alt+ArrowRight");
  await expect(item).toHaveAttribute("aria-level", "2");
  await undo.click();
  await expect(item).toHaveAttribute("aria-level", "1");
  await expect(undo).toBeDisabled();

  // So does Ctrl+Z on the box, and the server keeps the item where the undo left it.
  await selectBox(page.getByTestId(`wbs-box-${id}`));
  await page.keyboard.press("Alt+ArrowRight");
  await expect(item).toHaveAttribute("aria-level", "2");
  await item.press("Control+z");
  await expect(item).toHaveAttribute("aria-level", "1");
  await expect(saving).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(item).toHaveAttribute("aria-level", "1");

  // In the Gantt a nudged card comes back: from the button, and from Ctrl+Z before the nudge saved.
  await page.getByTestId("wbs-view-gantt").click();
  await expect(page.getByTestId("gantt-board")).toBeVisible();
  const dates = page.getByTestId(`gantt-card-${id}-dates`);
  const startsOn = async () => (await dates.textContent())!.slice(0, 10);
  const day0 = await startsOn();
  const card = page.getByTestId(`gantt-card-${id}-name`);
  await card.focus();
  await card.press("ArrowRight");
  await expect.poll(startsOn).toBe(plusDays(day0, 1));
  await undo.click();
  await expect.poll(startsOn).toBe(day0);
  // The card may have moved to another line and been drawn afresh: focus it again.
  await card.focus();
  await card.press("ArrowRight");
  await expect.poll(startsOn).toBe(plusDays(day0, 1));
  await card.press("Control+z");
  await expect.poll(startsOn).toBe(day0);
  await expect(saving).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect.poll(startsOn).toBe(day0);

  // The reloaded page shows its dates before it answers clicks: switch until the boxes show.
  await expect(async () => {
    await page.getByTestId("wbs-view-wbs").click();
    await expect(page.getByTestId(`wbs-box-${id}`)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  for (const boxId of [id, leadId]) {
    await selectBox(page.getByTestId(`wbs-box-${boxId}`));
    await page.getByTestId("wbs-delete").click();
    await page.getByRole("button", { name: W.delete, exact: true }).last().click();
    await expect(page.getByTestId(`wbs-box-${boxId}`)).toHaveCount(0);
  }
  await expect(saving).toBeHidden({ timeout: 15_000 });
});

test("WBS toolbar: People shows the names on the boxes, Copy CSV puts the breakdown on the clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const stamp = Date.now();
  const name = `E2E csv ${stamp}`;
  await page.goto("/projects/2/deliverables/gantt?view=wbs");
  const diagram = page.getByTestId("wbs-diagram");
  await expect(diagram).toBeVisible();
  await closeAlarmToast(page);

  await page.getByTestId("wbs-add").click();
  const field = page.locator("input:focus");
  await expect(field).toHaveValue(W.newItemName, { timeout: 15_000 });
  await field.fill(name);
  await field.press("Enter");
  const item = diagram.getByRole("treeitem", { name: new RegExp(escapeRegExp(name)) });
  await expect(item).toBeFocused();
  const id = await item.getAttribute("data-wbs-box");
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

  // People is off by default; on, a box with nobody on it says so, and the browser remembers it.
  const people = page.getByTestId("wbs-people");
  const names = page.getByTestId(`wbs-assignees-${id}`);
  await expect(people).toHaveAttribute("aria-pressed", "false");
  await expect(names).toHaveCount(0);
  await turnOn(people);
  await expect(names).toHaveText(messages.keyDeliverables.unassigned);
  await page.reload();
  await expect(people).toHaveAttribute("aria-pressed", "true");
  await expect(names).toBeVisible();
  await expect(async () => {
    await people.click();
    await expect(people).toHaveAttribute("aria-pressed", "false", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(names).toHaveCount(0);

  // Copy CSV: the header row, then this item among the rest, with no byte-order mark to paste.
  await page.getByTestId("wbs-copy-csv").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: W.csv.copied }).first(),
  ).toBeVisible();
  const csv = await page.evaluate(() => navigator.clipboard.readText());
  expect(csv.startsWith(W.csv.headers[0])).toBe(true);
  expect(csv).toContain(name);

  // Full screen pins the editor over the page; the browser may not offer it (then no button).
  const fullscreen = page.getByTestId("wbs-fullscreen");
  if ((await fullscreen.count()) > 0) {
    const editor = page.getByTestId("wbs-editor");
    await fullscreen.click();
    await expect(fullscreen).toHaveAttribute("aria-pressed", "true");
    await expect(editor).toHaveClass(/\bfixed\b/);
    expect(await page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(
      true,
    );
    await fullscreen.click();
    await expect(fullscreen).toHaveAttribute("aria-pressed", "false");
    await expect(editor).not.toHaveClass(/\bfixed\b/);
  }

  await selectBox(page.getByTestId(`wbs-box-${id}`));
  await page.getByTestId("wbs-delete").click();
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(page.getByTestId(`wbs-box-${id}`)).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
});

test("WBS item menu: Assignees… opens the details on the picker; the box names them", async ({
  page,
}) => {
  // Long: an item is created and renamed, the context menu is opened (with a
  // retry, below), a details sheet loads, and a stakeholder is picked and
  // saved — a dozen round trips against a real database. The default 30s
  // budget is spent before the last of them.
  test.slow();
  const name = `E2E assignee item ${Date.now()}`;
  await page.goto("/projects/2/deliverables/gantt?view=wbs");
  const diagram = page.getByTestId("wbs-diagram");
  await expect(diagram).toBeVisible();
  await closeAlarmToast(page);
  await showPeople(page);

  await page.getByTestId("wbs-add").click();
  const field = page.locator("input:focus");
  await expect(field).toHaveValue(W.newItemName, { timeout: 15_000 });
  await field.fill(name);
  await field.press("Enter");
  const item = diagram.getByRole("treeitem", { name: new RegExp(escapeRegExp(name)) });
  await expect(item).toBeFocused();
  const id = await item.getAttribute("data-wbs-box");

  // A new item has nobody on it: none is a normal number of assignees (migration 015), and the
  // box says so rather than leaving a gap.
  await expect(page.getByTestId(`wbs-assignees-${id}`)).toHaveText(
    messages.keyDeliverables.unassigned,
  );

  // Assignees… opens the item's details with the caret already in the picker.
  // The item was created a moment ago, so let its save settle first: a re-render
  // mid-gesture drops the menu and Shift+F10 lands on nothing. Then retry the
  // gesture itself, as the dependencies test does for the same reason — and retry
  // the menu item's own click with it, because that click is part of the gesture
  // rather than a step after it. The menu is positioned by a layout effect once it
  // has measured itself (wbs-context-menu.tsx), so it jumps once after mounting,
  // and a refresh or a stray pointerdown drops it outright. Left outside the loop
  // the click meets an element that is first unstable and then detached, with
  // nothing left to re-open it: run 41071026771 spent its whole budget there twice.
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  await expect(async () => {
    await item.click();
    await page.keyboard.press("Shift+F10");
    await page.getByTestId("wbs-menu-assignees").click({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  const form = page.getByTestId("deliverable-form");
  await expect(form).toBeVisible();
  const picker = form.getByLabel(messages.keyDeliverables.assignees);
  await expect(picker).toBeFocused();

  // Take the first stakeholder the project offers, save, and the box carries the name —
  // in its text and in the label a screen reader hears instead of that text.
  await picker.press("ArrowDown");
  // The picker's own listbox, not the page's first option: the Status and Priority fields above it
  // are native selects whose "None" option comes first in the DOM and can never be clicked.
  const option = form.getByRole("listbox").getByRole("option").first();
  const who = ((await option.textContent()) ?? "").trim();
  expect(who).not.toBe("");
  await option.click();
  await page.getByTestId("deliverable-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.saved }).first(),
  ).toBeVisible({ timeout: 15_000 });
  // The box draws initials; the stack's name is the people on it.
  await expect(
    page.getByTestId(`wbs-assignees-${id}`).getByRole("img", { name: who }),
  ).toBeVisible();
  // Earlier runs leave other boxes with the same person on a reused database: check this one.
  await expect(item).toHaveAccessibleName(new RegExp(escapeRegExp(who)));
});

test("WBS: a milestone is added as one day, converted either way, moved but not stretched", async ({
  page,
}) => {
  const stamp = Date.now();
  await page.goto("/projects/2/deliverables/gantt?view=gantt&scale=day");
  await expect(page.getByTestId("gantt-board")).toBeVisible();
  // The seeded overdue alert sits over the bottom-right of the chart, where the cards are dragged.
  await closeAlarmToast(page);
  const startField = page.getByTestId("wbs-details-start");
  const endField = page.getByTestId("wbs-details-end");

  // Add milestone: a date from the start, so it has one date and no end to set.
  const gateId = await addInGantt(page, `E2E gate ${stamp}`, "wbs-add-milestone");
  const gate = ganttMilestone(page, gateId);
  await expect(page.locator(`[data-wbs-details-name="${gateId}"]`)).toBeVisible();
  await expect(endField).toHaveCount(0);
  const day0 = await startField.inputValue();
  // The diamond reads as a date rather than a span.
  await expect(gate).toHaveAttribute("aria-label", new RegExp(`, ${day0}$`));

  // Arrow keys move it a day; Shift+arrow, which changes a task's end, leaves it alone.
  await gate.focus();
  await gate.press("ArrowRight");
  await expect(gate).toHaveAttribute("aria-label", new RegExp(`, ${plusDays(day0, 1)}$`));
  await gate.press("Shift+ArrowRight");
  await expect(startField).toHaveValue(plusDays(day0, 1), { timeout: 15_000 });
  await expect(gate).toHaveAttribute("aria-label", new RegExp(`, ${plusDays(day0, 1)}$`));
  await expect(endField).toHaveCount(0);

  // A task's conversion names the span it drops before it runs.
  const taskId = await addInGantt(page, `E2E span ${stamp}`);
  await expect(page.locator(`[data-wbs-details-name="${taskId}"]`)).toBeVisible();
  const taskDay0 = await startField.inputValue();
  const dialog = page.getByRole("dialog").filter({ hasText: "span is dropped" });
  await pickFromGanttMenu(
    page,
    page.getByTestId(`gantt-card-${taskId}-name`),
    "wbs-menu-milestone",
    dialog,
    W.turnIntoMilestone,
  );
  await dialog.getByRole("button", { name: W.turnIntoMilestone }).click();

  // It keeps its start and loses the span: a diamond now, with no end to set.
  const converted = ganttMilestone(page, taskId);
  await expect(converted).toHaveAttribute("aria-label", new RegExp(`, ${taskDay0}$`));
  await expect(startField).toHaveValue(taskDay0);
  await expect(endField).toHaveCount(0);

  // Turning it back keeps the one day, and then it can be stretched again.
  await pickFromGanttMenu(page, converted, "wbs-menu-milestone", endField, W.turnIntoTask);
  await expect(endField).toHaveValue(taskDay0);
  await endField.fill(plusDays(taskDay0, 4));
  await endField.press("Enter");
  await expect(endField).toHaveValue(plusDays(taskDay0, 4));
  await expect(page.getByTestId(`gantt-card-${taskId}-dates`)).toHaveText(
    `${taskDay0} – ${plusDays(taskDay0, 4)}`,
  );

  // In the WBS a top-level milestone sits only in the strip above the project box, named with
  // its YYYY-MM-DD date; the task is a box, with no diamond.
  await page.getByTestId("wbs-view-wbs").click();
  await expect(page.getByTestId("wbs-diagram")).toBeVisible();
  const strip = page.getByTestId("wbs-milestone-strip");
  const gateChip = page.getByTestId(`wbs-milestone-chip-${gateId}`);
  await expect(gateChip).toContainText(`E2E gate ${stamp}`);
  await expect(gateChip).toContainText(plusDays(day0, 1));
  await expect(page.getByTestId(`wbs-milestone-chip-${taskId}`)).toHaveCount(0);
  await expect(page.getByTestId(`wbs-box-${gateId}`)).toHaveCount(0);
  await expect(page.getByTestId(`wbs-box-${taskId}`)).toBeVisible();
  await expect(page.getByTestId(`wbs-milestone-${taskId}`)).toHaveCount(0);

  // The Milestones toggle hides the strip and draws the milestone as a box with a diamond beside
  // its number; the choice survives a reload.
  const toggle = page.getByTestId("wbs-milestones");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(strip).toHaveCount(0);
  await expect(page.getByTestId(`wbs-milestone-${gateId}`)).toBeVisible();
  await expect(
    page.getByRole("treeitem", { name: new RegExp(escapeRegExp(`E2E gate ${stamp}`)) }),
  ).toHaveAttribute("aria-label", /Milestone, /);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(page.getByTestId(`wbs-box-${gateId}`)).toBeVisible({ timeout: 15_000 });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(strip).toHaveCount(0);

  // Clean up both items so the seeded project does not grow a milestone per run, then show the
  // strip again.
  for (const id of [gateId, taskId]) {
    await selectBox(page.getByTestId(`wbs-box-${id}`));
    await page.getByTestId("wbs-delete").click();
    await page.getByRole("button", { name: W.delete, exact: true }).last().click();
    await expect(page.getByTestId(`wbs-box-${id}`)).toHaveCount(0);
  }
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(gateChip).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
});

test("WBS notes: a paperclip note on a box and the project's note autosave and come back", async ({
  page,
}) => {
  const stamp = Date.now();
  await page.goto("/projects/2/deliverables/gantt?view=wbs");
  const diagram = page.getByTestId("wbs-diagram");
  await expect(diagram).toBeVisible();
  await closeAlarmToast(page);

  await page.getByTestId("wbs-add").click();
  const field = page.locator("input:focus");
  await expect(field).toHaveValue(W.newItemName, { timeout: 15_000 });
  await field.fill(`E2E noted ${stamp}`);
  await field.press("Enter");
  const item = diagram.getByRole("treeitem", { name: new RegExp(`E2E noted ${stamp}`) });
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  const id = await item.getAttribute("data-wbs-box");
  const box = page.getByTestId(`wbs-box-${id}`);
  const clip = page.getByTestId(`wbs-note-${id}`);

  // The paperclip means a note: none on a box without one, even selected. The note is added from
  // the details panel that selecting the box opens.
  await selectBox(box);
  await expect(clip).toHaveCount(0);
  const add = page.getByTestId("wbs-details-note");
  await expect(add).toHaveAccessibleName(/^Add a note to item /);
  await add.click();
  const note = page.getByTestId("wbs-details-note-panel").getByRole("textbox");
  await note.fill(`Ring the supplier ${stamp}`);
  await expect(page.getByTestId("wbs-details-note-panel")).toContainText(messages.feedback.saved, {
    timeout: 15_000,
  });
  // Typing in the note never reaches the box: no rename, no move.
  await note.press("ArrowDown");
  await expect(page.getByTestId("wbs-details-note-panel")).toBeVisible();
  await note.press("Escape");
  await expect(add).toBeFocused();

  await page.reload();
  await expect(clip).toHaveAccessibleName(/^Note on item /);
  await clip.click();
  await expect(page.getByTestId(`wbs-note-${id}-panel`).getByRole("textbox")).toHaveValue(
    `Ring the supplier ${stamp}`,
  );
  await page.keyboard.press("Escape");

  // The project's note sits in the toolbar and keeps its text the same way.
  await page.getByTestId("wbs-plan-note").click();
  const planNote = page.getByTestId("wbs-plan-note-panel").getByRole("textbox");
  await planNote.fill(`Kick-off on Monday ${stamp}`);
  await expect(page.getByTestId("wbs-plan-note-panel")).toContainText(messages.feedback.saved, {
    timeout: 15_000,
  });
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByTestId("wbs-plan-note").click();
  await expect(page.getByTestId("wbs-plan-note-panel").getByRole("textbox")).toHaveValue(
    `Kick-off on Monday ${stamp}`,
  );
  await page.getByTestId("wbs-plan-note-panel").getByRole("textbox").fill("");
  await expect(page.getByTestId("wbs-plan-note-panel")).toContainText(messages.feedback.saved, {
    timeout: 15_000,
  });
  await page.keyboard.press("Escape");

  await selectBox(box);
  await page.getByTestId("wbs-delete").click();
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(box).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
});

test("WBS details panel: priority, budget, colour, assignees and Done save and come back", async ({
  page,
}) => {
  test.slow();
  const stamp = Date.now();
  const K = messages.keyDeliverables;
  const P = W.panel;
  await page.goto("/projects/2/deliverables/gantt?view=wbs");
  const diagram = page.getByTestId("wbs-diagram");
  await expect(diagram).toBeVisible();
  await closeAlarmToast(page);
  await showBoxDetails(page);
  await showPeople(page);

  await page.getByTestId("wbs-add").click();
  const field = page.locator("input:focus");
  await expect(field).toHaveValue(W.newItemName, { timeout: 15_000 });
  await field.fill(`E2E panel ${stamp}`);
  await field.press("Enter");
  const item = diagram.getByRole("treeitem", { name: new RegExp(`E2E panel ${stamp}`) });
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  const id = await item.getAttribute("data-wbs-box");
  const box = page.getByTestId(`wbs-box-${id}`);
  await selectBox(box);

  const panel = page.getByTestId("wbs-details-panel");
  await expect(panel).toBeVisible();
  await panel.getByTestId("wbs-details-priority").selectOption({ index: 1 });
  const priority = await panel.getByTestId("wbs-details-priority").inputValue();
  await panel.getByTestId("wbs-details-budget").fill("1250.50");
  await panel.getByTestId("wbs-details-budget").press("Enter");
  await panel.getByTestId("wbs-details-colour-blue").click();
  await expect(panel.getByTestId("wbs-details-colour-blue")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await panel.getByTestId("wbs-details-done").click();
  await expect(panel.getByTestId("wbs-details-done")).toHaveText(P.done);

  // Someone is put on the item from the panel, and the box names them at once.
  const assignees = page.getByTestId(`wbs-assignees-${id}`);
  await expect(assignees).toHaveText(K.unassigned);
  await panel.getByRole("combobox", { name: K.assignees }).click();
  const option = panel.getByRole("listbox").getByRole("option").first();
  const who = ((await option.textContent()) ?? "").trim();
  expect(who).not.toBe("");
  await option.click();
  const unassign = panel.getByRole("button", { name: K.removeAssignee(who) });
  await expect(unassign).toBeVisible();
  await expect(assignees.getByRole("img", { name: who })).toBeVisible();
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

  await page.reload();
  // A click before hydration selects nothing; the gesture is retried until the panel opens.
  await expect(async () => {
    await selectBox(box);
    await expect(panel).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(panel.getByTestId("wbs-details-priority")).toHaveValue(priority);
  await expect(panel.getByTestId("wbs-details-budget")).toHaveValue("1250.5");
  await expect(panel.getByTestId("wbs-details-colour-blue")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByTestId(`wbs-status-chip-${id}`)).toHaveText("Completed");
  await expect(assignees.getByRole("img", { name: who })).toBeVisible();

  // The label names the picker, not the chip's ×: clicking it keeps the person on the item.
  await panel.getByText(K.assignees, { exact: true }).click();
  await expect(panel.getByRole("combobox", { name: K.assignees })).toBeFocused();
  await expect(unassign).toBeVisible();

  // Taking them off again saves too.
  await unassign.click();
  await expect(assignees).toHaveText(K.unassigned);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  await page.reload();
  await expect(async () => {
    await selectBox(box);
    await expect(panel).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(assignees).toHaveText(K.unassigned);
  await expect(unassign).toHaveCount(0);
  await page.getByTestId("wbs-details-close").click();
  await expect(panel).toHaveCount(0);

  await selectBox(box);
  await page.getByTestId("wbs-delete").click();
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(box).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
});

test("WBS requirement More: MoSCoW, criteria, estimate and owner save and come back", async ({
  page,
}) => {
  test.slow();
  const stamp = Date.now();
  const text = `E2E planned ${stamp}`;
  const R = messages.requirements;
  await page.goto("/projects/2/deliverables/gantt?view=wbs");
  const diagram = page.getByTestId("wbs-diagram");
  await expect(diagram).toBeVisible();
  await closeAlarmToast(page);
  await showBoxDetails(page);

  await page.getByTestId("wbs-add").click();
  const field = page.locator("input:focus");
  await expect(field).toHaveValue(W.newItemName, { timeout: 15_000 });
  await field.fill(`E2E more ${stamp}`);
  await field.press("Enter");
  const item = diagram.getByRole("treeitem", { name: new RegExp(`E2E more ${stamp}`) });
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  const id = await item.getAttribute("data-wbs-box");

  await page.getByTestId(`wbs-req-add-${id}`).click();
  const add = page.getByLabel(W.newRequirementFor(""), { exact: false });
  await expect(add).toBeFocused({ timeout: 15_000 });
  await add.fill(text);
  await add.press("Enter");
  await add.press("Escape");
  const row = page.getByTestId(`wbs-reqs-${id}`).locator("li").filter({ hasText: text });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

  // More opens on the saved row; MoSCoW saves on the press and the box shows it at once.
  const more = page.getByRole("button", { name: W.requirementMore(text), exact: true });
  await row.hover();
  await more.click();
  const panel = page.locator('[data-testid^="wbs-req-more-"][data-testid$="-panel"]');
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: R.moscow.M, exact: true }).click();
  await expect(panel.getByRole("button", { name: R.moscow.M, exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(row.getByLabel(R.moscow.M, { exact: true })).toBeVisible();

  // A bad estimate is refused in place; a good one saves with the criteria and an owner.
  await panel.getByLabel(R.acceptanceCriteria).fill(`Signed off by the client ${stamp}`);
  await panel.getByLabel(R.estimateDays).fill("1.25");
  await panel.getByRole("button", { name: messages.actions.save, exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveText(R.estimateInvalid);
  await panel.getByLabel(R.estimateDays).fill("2.5");
  await panel.getByLabel(R.owner).selectOption({ index: 1 });
  const owner = (await panel.getByLabel(R.owner).locator("option:checked").textContent()) ?? "";
  await panel.getByRole("button", { name: messages.actions.save, exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(more).toBeFocused();
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  // The estimate is the box's effort.
  await expect(page.getByTestId(`wbs-meta-${id}`)).toContainText(W.meta.days(2.5));

  await page.reload();
  await expect(row.getByLabel(R.moscow.M, { exact: true })).toBeVisible({ timeout: 15_000 });
  // More shows only while its row is hovered, and the box settles its height after a reload, which
  // can move the row from under the pointer: each try hovers again instead of waiting on one click.
  await expect(async () => {
    await row.hover();
    await more.click({ timeout: 2_000 });
    await expect(panel).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(panel.getByLabel(R.acceptanceCriteria)).toHaveValue(
    `Signed off by the client ${stamp}`,
  );
  await expect(panel.getByLabel(R.estimateDays)).toHaveValue("2.5");
  await expect(panel.getByLabel(R.owner).locator("option:checked")).toHaveText(owner);
  // Escape leaves without saving and gives the focus back to More.
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(more).toBeFocused();

  await selectBox(page.getByTestId(`wbs-box-${id}`));
  await page.getByTestId("wbs-delete").click();
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(item).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
});

test("WBS filter: search finds a requirement, a type chip hides it, clearing brings all back", async ({
  page,
}) => {
  test.slow();
  const stamp = Date.now();
  const needle = `E2E needle ${stamp}`;
  const other = `E2E other ${stamp}`;
  await page.goto("/projects/2/deliverables/gantt?view=wbs");
  const diagram = page.getByTestId("wbs-diagram");
  await expect(diagram).toBeVisible();
  await closeAlarmToast(page);

  async function addItem(name: string): Promise<string> {
    await page.getByTestId("wbs-add").click();
    const field = page.locator("input:focus");
    await expect(field).toHaveValue(W.newItemName, { timeout: 15_000 });
    await field.fill(name);
    await field.press("Enter");
    await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
    const box = diagram.getByRole("treeitem", { name: new RegExp(name) });
    return (await box.getAttribute("data-wbs-box")) ?? "";
  }
  const withReq = await addItem(`E2E filter A ${stamp}`);
  const bare = await addItem(`E2E filter B ${stamp}`);

  await page.getByTestId(`wbs-req-add-${withReq}`).click();
  const add = page.getByLabel(W.newRequirementFor(""), { exact: false });
  await expect(add).toBeFocused({ timeout: 15_000 });
  await add.fill(needle);
  await add.press("Enter");
  await add.fill(other);
  await add.press("Enter");
  await add.press("Escape");
  const row = page.getByTestId(`wbs-reqs-${withReq}`).locator("li").filter({ hasText: needle });
  const otherRow = page.getByTestId(`wbs-reqs-${withReq}`).locator("li").filter({ hasText: other });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(otherRow).toBeVisible({ timeout: 15_000 });
  const filteredOut = page.getByTestId(`wbs-reqs-filtered-${withReq}`);
  await expect(filteredOut).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

  const boxA = page.getByTestId(`wbs-box-${withReq}`);
  const boxB = page.getByTestId(`wbs-box-${bare}`);

  // Hovering a name shows the box's facts: dates as YYYY-MM-DD, and nobody on it yet.
  const tip = page.getByTestId(`wbs-tip-${bare}`);
  await expect(tip).toBeHidden();
  await page.getByTestId(`wbs-name-${bare}`).hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(`E2E filter B ${stamp}`);
  await expect(tip).toContainText(/\d{4}-\d{2}-\d{2}/);
  await expect(tip).toContainText(messages.keyDeliverables.unassigned);

  // The search keeps the item whose requirement holds it, and drops the one without; the box
  // still counts both requirements and says the filter leaves one out.
  await page.getByTestId("wbs-search").fill(needle.toUpperCase());
  await expect(boxA).toBeVisible();
  await expect(row).toBeVisible();
  await expect(otherRow).toHaveCount(0);
  await expect(page.getByTestId(`wbs-req-toggle-${withReq}`)).toHaveText(W.requirementCount(0, 2));
  await expect(filteredOut).toHaveText(W.filter.hiddenRequirements(1));
  await expect(boxB).toHaveCount(0);
  await expect(page.getByTestId("wbs-filter-clear")).toBeVisible();

  // A search for nothing says so; Clear brings everything back.
  await page.getByTestId("wbs-search").fill(`no such thing ${stamp}`);
  await expect(page.getByTestId("wbs-no-match")).toHaveText(W.filter.noMatch);
  await expect(boxA).toHaveCount(0);
  await page.getByTestId("wbs-filter-clear").click();
  await expect(page.getByTestId("wbs-search")).toHaveValue("");
  await expect(page.getByTestId("wbs-no-match")).toHaveText("");
  await expect(boxA).toBeVisible();
  await expect(boxB).toBeVisible();
  await expect(otherRow).toBeVisible();
  await expect(filteredOut).toHaveCount(0);

  // Turning FR off hides the item whose only requirement is FR; the bare item stays.
  const fr = page.getByTestId("wbs-chip-FR");
  await expect(fr).toHaveAttribute("aria-pressed", "true");
  await fr.click();
  await expect(fr).toHaveAttribute("aria-pressed", "false");
  await expect(boxA).toHaveCount(0);
  await expect(boxB).toBeVisible();
  await fr.click();
  await expect(boxA).toBeVisible();
  await expect(page.getByTestId("wbs-filter-clear")).toHaveCount(0);

  // The Gantt has no filter bar.
  await page.goto("/projects/2/deliverables/gantt?view=gantt");
  await expect(page.getByTestId("gantt-board")).toBeVisible();
  await expect(page.getByTestId("wbs-filter")).toHaveCount(0);

  await page.goto("/projects/2/deliverables/gantt?view=wbs");
  for (const id of [withReq, bare]) {
    await selectBox(page.getByTestId(`wbs-box-${id}`));
    await page.getByTestId("wbs-delete").click();
    await page.getByRole("button", { name: W.delete, exact: true }).last().click();
    await expect(page.getByTestId(`wbs-box-${id}`)).toHaveCount(0);
    await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  }
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
  await showBoxDetails(page);

  await page.getByTestId("wbs-add").click();
  const field = page.locator("input:focus");
  await expect(field).toHaveValue(W.newItemName, { timeout: 15_000 });
  await field.fill(longName);
  await field.press("Enter");
  const item = diagram.getByRole("treeitem", { name: new RegExp(escapeRegExp(longName)) });
  await expect(item).toBeFocused();
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
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

  // A right-click opens it too; Status sets the status, and the box's chip shows it.
  await box.click({ button: "right", position: { x: 4, y: 4 } });
  await expect(menu).toBeVisible();
  await page.getByTestId("wbs-menu-status").click();
  await page.getByTestId("wbs-status-Completed").click();
  await expect(menu).toBeHidden();
  await expect(page.getByTestId(`wbs-status-chip-${id}`)).toHaveText("Completed");

  // Requirements: add two under the box (the field stays open for the next), the second a
  // non-functional one, then tick one.
  await page.getByTestId(`wbs-req-add-${id}`).click();
  const add = page.getByLabel(W.newRequirementFor(""), { exact: false });
  const addType = (type: string) =>
    page
      .getByRole("group", { name: W.requirementTypeFor(""), exact: false })
      .getByRole("button", { name: type, exact: true });
  await expect(add).toBeFocused({ timeout: 15_000 });
  await expect(addType("FR")).toHaveAttribute("aria-pressed", "true");
  await add.fill(`E2E permit ${stamp}`);
  await add.press("Enter");
  await addType("NFR").click();
  await add.fill(`E2E soil report ${stamp}`);
  await add.press("Enter");
  // The kind chosen stays chosen for the next one.
  await expect(addType("NFR")).toHaveAttribute("aria-pressed", "true");
  await add.press("Escape");
  const list = page.getByTestId(`wbs-reqs-${id}`);
  await expect(list).toContainText(`E2E permit ${stamp}`, { timeout: 15_000 });
  await expect(list).toContainText(`E2E soil report ${stamp}`, { timeout: 15_000 });
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

  // Each chip says which requirement of the register it is, in the kind it was added as.
  const chipRow = (text: string) => list.locator("li").filter({ hasText: text });
  await expect(chipRow(`E2E permit ${stamp}`)).toContainText(/^FR-\d+/);
  await expect(chipRow(`E2E soil report ${stamp}`)).toContainText(/^NFR-\d+/);
  // A row keeps to one line; pointing at it shows the whole requirement.
  await chipRow(`E2E permit ${stamp}`).hover();
  await expect(chipRow(`E2E permit ${stamp}`).getByTestId("wbs-req-bubble")).toBeVisible();

  await list.getByLabel(W.requirementMet(`E2E permit ${stamp}`)).check();
  await expect(page.getByTestId(`wbs-req-toggle-${id}`)).toHaveText(W.requirementCount(1, 2));

  // In the Gantt the card's chip counts them and opens the same list under the chart, with chips
  // that count each kind; move the second one up there.
  await page.getByTestId("wbs-view-gantt").click();
  const chip = page.getByTestId(`gantt-card-${id}-requirements`);
  await expect(chip).toHaveText(W.card.requirements(1, 2));
  const panel = page.getByTestId("gantt-requirements");
  const openPanel = async () =>
    expect(async () => {
      if ((await panel.count()) === 0) await chip.click();
      await expect(panel).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
  await openPanel();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  const panelRow = (text: string) => panel.locator("li").filter({ hasText: text });
  const permit = panelRow(`E2E permit ${stamp}`);
  const soil = panelRow(`E2E soil report ${stamp}`);
  await expect(soil).toContainText(/NFR-\d+/);
  await expect(
    panel.getByLabel(W.requirementMet(`E2E permit ${stamp}`), { exact: true }),
  ).toBeChecked();

  // A kind's chip hides that kind, as in the WBS filter; clearing brings both back.
  await expect(panel.getByTestId("gantt-req-chip-FR")).toContainText("1");
  await expect(panel.getByTestId("gantt-req-chip-TR")).toHaveCount(0);
  await panel.getByTestId("gantt-req-chip-FR").click();
  await expect(permit).toHaveCount(0);
  await expect(soil).toBeVisible();
  await panel.getByTestId("gantt-req-chip-clear").click();
  await expect(permit).toBeVisible();

  // A row's moves show when it is pointed at.
  await soil.hover();
  await soil
    .getByRole("button", { name: W.moveRequirementUp(`E2E soil report ${stamp}`), exact: true })
    .click();
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

  // Saved: after a reload the order and the tick are still there.
  await page.reload();
  await openPanel();
  const texts = panel.getByRole("button", {
    name: new RegExp(`^${escapeRegExp(W.editRequirement("E2E "))}.*${stamp}$`),
  });
  await expect(texts).toHaveCount(2);
  await expect(texts.first()).toHaveText(`E2E soil report ${stamp}`);
  await expect(texts.last()).toHaveText(`E2E permit ${stamp}`);

  // The × takes a requirement off this deliverable without asking (ADR-0037).
  await expect(async () => {
    if ((await texts.count()) === 2) {
      await permit.hover();
      await permit
        .getByRole("button", { name: W.removeRequirement(`E2E permit ${stamp}`), exact: true })
        .click({ timeout: 2_000 });
    }
    await expect(texts).toHaveCount(1, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(chip).toHaveText(W.card.requirements(0, 1));
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

  // The status set from the menu came back with the reload.
  await page.getByTestId("wbs-view-wbs").click();
  await expect(page.getByTestId(`wbs-status-chip-${id}`)).toHaveText("Completed");
  await page.getByTestId("wbs-view-gantt").click();

  // Deleting the item counts the requirement it unallocates and says it stays in the register.
  // Shift+F10 is the card's own menu key (isMenuKey, wbs-context-menu.tsx); the keyboard path
  // does not depend on where the pointer lands.
  const confirm = page.getByRole("dialog").filter({ hasText: W.deleteBody });
  await pickFromGanttMenu(
    page,
    page.getByTestId(`gantt-card-${id}-name`),
    "wbs-menu-delete",
    confirm,
  );
  await expect(confirm).toContainText(W.deleteUnallocates(1));
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(page.getByTestId(`gantt-card-${id}`)).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

  // Neither act deleted anything: the register still holds both requirements.
  await page.goto(`/projects/2/requirements?view=list&q=${stamp}`);
  await expectListed(page, `E2E permit ${stamp}`);
  await expectListed(page, `E2E soil report ${stamp}`);
});

test("WBS: two items are linked, the successor is pushed, and the link goes with its item", async ({
  page,
}) => {
  // Long: two items created and renamed, one moved, the dependencies panel
  // opened twice (each behind a retry), a link made and the cascade awaited.
  test.slow();
  const stamp = Date.now();
  await page.goto("/projects/2/deliverables/gantt?view=gantt&scale=day");
  await expect(page.getByTestId("gantt-board")).toBeVisible();
  await closeAlarmToast(page);

  // Two items. A new sibling is placed the day AFTER the one it follows ends
  // (newItemDates), so out of the box an FS link has nothing to push: the
  // successor already starts where the link would put it. The overlap this test
  // needs is made below, by moving the second item back onto the first.
  const firstId = await addInGantt(page, `E2E pour ${stamp}`);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  const secondId = await addInGantt(page, `E2E cure ${stamp}`);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

  // A card picked while the name field has focus: the typing stays on the item it was typed for.
  await page.locator(`[data-wbs-details-name="${secondId}"]`).fill(`E2E cured ${stamp}`);
  await selectCard(page, firstId);
  await expect(page.getByTestId(`gantt-card-${secondId}-name`)).toContainText(`E2E cured ${stamp}`);
  await expect(page.getByTestId(`gantt-card-${firstId}-name`)).toContainText(`E2E pour ${stamp}`);
  await expect(page.locator(`[data-wbs-details-name="${firstId}"]`)).toHaveValue(
    `E2E pour ${stamp}`,
  );
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  const startField = page.getByTestId("wbs-details-start");
  const firstStart = await startField.inputValue();
  const firstEnd = await page.getByTestId("wbs-details-end").inputValue();

  // Overlap them: the second now starts the day the first does, which an FS
  // link may not allow, so there is something for the cascade to do.
  await selectCard(page, secondId);
  await startField.fill(firstStart);
  await startField.blur();
  await expect(startField).toHaveValue(firstStart, { timeout: 15_000 });
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  const secondDates = page.getByTestId(`gantt-card-${secondId}-dates`);
  const secondStart = async () => (await secondDates.textContent())!.slice(0, 10);
  await expect.poll(secondStart).toBe(firstStart);

  // Links are made in the Dependencies panel, opened from the card's menu.
  const secondName = page.getByTestId(`gantt-card-${secondId}-name`);
  const panel = page.getByTestId("wbs-dependencies");
  await pickFromGanttMenu(page, secondName, "wbs-menu-dependencies", panel);
  await expect(panel).toContainText(W.noDependencies);
  await panel.getByRole("combobox", { name: W.dependencyPredecessor }).fill(`E2E pour ${stamp}`);
  await page.getByRole("option", { name: new RegExp(escapeRegExp(`E2E pour ${stamp}`)) }).click();
  await page.getByTestId("wbs-dependency-submit").click();
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

  // Linking leaves the panel open, so more links can be made from it. Close it before touching the
  // cards again: it is a modal, and a click on anything behind it never reaches the card.
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  // The successor has been pushed past its predecessor's end, and it did not move on its own
  // before the link existed (ADR-0046 decisions 6-7).
  await expect.poll(secondStart, { timeout: 15_000 }).not.toBe(firstStart);
  expect(new Date(await secondStart()) > new Date(firstEnd)).toBe(true);

  // The link is drawn card to card, and the panel lists it in both directions.
  const dependency = page.locator(
    `[data-gantt-dependency-from="${firstId}"][data-gantt-dependency-to="${secondId}"]`,
  );
  await expect(dependency.locator("path").first()).toBeVisible();
  await pickFromGanttMenu(page, secondName, "wbs-menu-dependencies", panel);
  await expect(panel).toContainText(`E2E pour ${stamp}`);
  await page.keyboard.press("Escape");

  // Deleting the predecessor takes the link with it, so no arrow is left pointing at nothing.
  const confirm = page.getByRole("dialog").filter({ hasText: W.deleteBody });
  await pickFromGanttMenu(
    page,
    page.getByTestId(`gantt-card-${firstId}-name`),
    "wbs-menu-delete",
    confirm,
  );
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(page.getByTestId(`gantt-card-${firstId}`)).toHaveCount(0);
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  await expect(
    page.locator(
      `[data-gantt-dependency-from="${firstId}"], [data-gantt-dependency-to="${firstId}"]`,
    ),
  ).toHaveCount(0);

  // Clean up the successor so the seeded project does not grow an item per run.
  await pickFromGanttMenu(page, secondName, "wbs-menu-delete", confirm);
  await page.getByRole("button", { name: W.delete, exact: true }).last().click();
  await expect(page.getByTestId(`gantt-card-${secondId}`)).toHaveCount(0);
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
  await expect(page.getByTestId("gantt-board")).toBeVisible();
  await expect(page.locator("[data-gantt-card]").first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});
