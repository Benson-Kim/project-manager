import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";
import { escapeRegExp, expectListed } from "./support/datasheet";

/**
 * The requirement register (ADR-0037) on project 2, as e2e-pm (project Manager). One story:
 * add a business and a stakeholder requirement in the new-entry row, merge them into a functional
 * one, allocate it to two deliverables, tick it in the register and see the tick under both
 * deliverables in the WBS and both needs read "Validated", then see the delete name what it costs.
 * Plus the type rules, the type filter, axe on the list and the sheet, and 360 px without
 * sideways scroll. Each test stamps its own wording, so runs never collide.
 */

const M = messages.requirements;
const W = messages.keyDeliverables.wbs;
const REGISTER = "/projects/2/requirements?view=list";
// A reference is a path now (ADR-0048): "FR-3", "FR-3.1", "FR-3.1.2". The trailing groups are
// optional, so a root row reads exactly as it did.
const REF = /\b(?:BR|SR|FR|NFR|TR)-\d+(?:\.\d+)*\b/;

const newEntry = (column: string) => messages.datasheet.newEntryField(column);
const cellName = (column: string, row: string) =>
  new RegExp(`^${escapeRegExp(messages.datasheet.cellLabel(column, row))}$`);

/** The register row holding this wording — its Requirement cell carries the row's label. */
function rowOf(page: Page, text: string): Locator {
  return page
    .getByRole("row")
    .filter({ has: page.getByRole("textbox", { name: cellName(M.requirement, text) }) });
}

/** A chip picker of the sheet (its field wraps one combobox and its options). */
function picker(form: Locator, field: string): Locator {
  return form.locator(`[data-field="${field}"]`);
}

const chips = (field: Locator) => field.getByRole("button", { name: /^Remove / });

/** Picks the first option the field still offers. */
async function pickFirst(field: Locator): Promise<void> {
  const before = await chips(field).count();
  await field.getByRole("combobox").click();
  await field.getByRole("option").first().click();
  await expect(chips(field)).toHaveCount(before + 1);
}

/** Adds a requirement in the datasheet's new-entry row and waits for the list to show it. */
async function addRequirement(page: Page, type: string, text: string): Promise<void> {
  const addRow = page.getByTestId("datasheet-add-row");
  await expect(addRow).toBeVisible();
  const field = addRow.getByRole("textbox", { name: newEntry(M.requirement) });
  await expect(field).toHaveAttribute("placeholder", M.placeholders.requirement);
  await addRow.getByRole("combobox", { name: newEntry(M.type) }).selectOption(type);
  await field.fill(text);
  await field.press("Enter");
  // The row clears for the next entry once the record is saved.
  await expect(field).toHaveValue("");
  await expect(rowOf(page, text)).toBeVisible();
}

/** The reference the register shows for a row ("BR-7"): the only one in its own row. */
async function refOf(page: Page, text: string): Promise<string> {
  const row = rowOf(page, text);
  await expect(row).toBeVisible();
  const ref = (await row.innerText()).match(REF);
  expect(ref, `no reference in the row of ${text}`).not.toBeNull();
  return ref![0];
}

function openRow(page: Page, text: string): Promise<void> {
  return rowOf(page, text)
    .getByRole("button", { name: messages.datasheet.open(text) })
    .click();
}

/** WBS boxes start with their requirement lists folded; this opens every one on the chart. */
async function openRequirementLists(page: Page): Promise<void> {
  await expect(page.getByTestId("wbs-diagram")).toBeVisible();
  const folded = page.locator('[data-testid^="wbs-req-toggle-"][aria-expanded="false"]');
  // A click before hydration does nothing, so the pass is retried until none is left folded.
  await expect(async () => {
    const count = await folded.count();
    for (let i = 0; i < count; i++) await folded.first().click();
    await expect(folded).toHaveCount(0, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

async function axe(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? "")),
  ).toEqual([]);
}

test("register: two needs merge into a functional requirement that two deliverables share", async ({
  page,
}) => {
  const stamp = Date.now();
  const br = `E2E business need ${stamp}`;
  const sr = `E2E stakeholder need ${stamp}`;
  const fr = `E2E functional solution ${stamp}`;

  await page.goto(`${REGISTER}&q=${stamp}`);
  await expect(page.getByRole("heading", { name: M.title })).toBeVisible();
  await closeAlarmToast(page);
  await axe(page);

  await addRequirement(page, "BR", br);
  await addRequirement(page, "SR", sr);
  // Read both saved rows together before selecting them. This also isolates the merge from
  // unrelated records and in-flight new-entry refreshes on the shared seeded project.
  await page.goto(`${REGISTER}&q=${stamp}`);
  const brRef = await refOf(page, br);
  const srRef = await refOf(page, sr);
  expect(brRef).toMatch(/^BR-\d+$/);
  expect(srRef).toMatch(/^SR-\d+$/);
  // A need carries no met tick and no coverage until a solution validates it.
  await expect(rowOf(page, br)).toContainText(M.coverageNone);
  await expect(page.getByRole("combobox", { name: cellName(M.met, br) })).toHaveCount(0);

  // Selecting the two needs offers the merge; it opens the sheet as a new solution. The list's
  // selection is DataView state, so a background refresh that remounts the rows drops the ticks:
  // insist on both until the merge is offered.
  const selectBr = page.getByRole("checkbox", { name: messages.list.selectRow(br) });
  const selectSr = page.getByRole("checkbox", { name: messages.list.selectRow(sr) });
  const merge = page.getByTestId("requirements-merge");
  await expect(async () => {
    await selectBr.check();
    await selectSr.check();
    await expect(merge).toBeVisible();
  }).toPass({ timeout: 20_000 });
  await merge.click();
  await expect(page).toHaveURL(/id=new/);

  const form = page.getByTestId("requirement-form");
  await expect(form).toBeVisible();
  await expect(form.getByLabel(M.type, { exact: true })).toHaveValue("FR");
  await expect(chips(picker(form, "validatesIds[]"))).toHaveCount(2);

  // Wording, the met tick left off for now, and the first two deliverables of the breakdown.
  await form.getByLabel(M.requirement, { exact: true }).fill(fr);
  const deliverables = picker(form, "deliverableIds[]");
  await pickFirst(deliverables);
  await pickFirst(deliverables);
  await axe(page);
  // The picker drops its panel on each pick, so nothing covers Save. Escape is still no use: it
  // closes the panel while the picker holds it open, and otherwise reaches the sheet and shuts it.
  await expect(deliverables.getByRole("listbox")).toBeHidden();
  await page.getByTestId("requirement-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible();
  await expect(form).toHaveCount(0);

  // The register lists it with the needs it validates, and with no coverage of its own.
  await page.goto(`${REGISTER}&q=${encodeURIComponent(fr)}`);
  await expectListed(page, fr);
  await expect(rowOf(page, fr)).toContainText(brRef);
  await expect(rowOf(page, fr)).toContainText(srRef);

  // The met tick is one of the register's cells; every deliverable it sits on shares it.
  await page.getByRole("combobox", { name: cellName(M.met, fr) }).selectOption("on");
  await expect(page.getByText(messages.datasheet.saved(M.met))).toBeAttached();

  await page.goto("/projects/2/deliverables/gantt?view=wbs");
  await openRequirementLists(page);
  const met = page.getByRole("checkbox", { name: W.requirementMet(fr) });
  await expect(met).toHaveCount(2);
  await expect(met.first()).toBeChecked();
  await expect(met.nth(1)).toBeChecked();

  // Both needs now read validated, since the only solution validating them is met.
  await page.goto(`${REGISTER}&q=${encodeURIComponent(stamp)}`);
  await expect(rowOf(page, br)).toContainText(M.coverageDone);
  await expect(rowOf(page, sr)).toContainText(M.coverageDone);

  // Deleting names what it costs before it runs.
  await openRow(page, fr);
  await expect(form).toBeVisible();
  await expect(chips(picker(form, "deliverableIds[]"))).toHaveCount(2);
  await page.getByTestId("requirement-delete").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(M.deleteLeaves(2));
  await expect(dialog).toContainText(M.deleteUnlinks(`${brRef}, ${srRef}`));
  await dialog.getByRole("button", { name: messages.actions.delete }).click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.deleted }).first(),
  ).toBeVisible();

  // The needs stay in the register, unvalidated again.
  await page.goto(`${REGISTER}&q=${encodeURIComponent(stamp)}`);
  await expectListed(page, br);
  await expect(rowOf(page, br)).toContainText(M.coverageNone);
});

test("a linked requirement changes type only in the sheet, which offers the types that fit", async ({
  page,
}) => {
  const stamp = Date.now();
  const br = `E2E typed need ${stamp}`;
  const fr = `E2E typed solution ${stamp}`;

  await page.goto(`${REGISTER}&q=${stamp}`);
  await addRequirement(page, "BR", br);
  await addRequirement(page, "FR", fr);

  // A row nothing points at changes type in its cell.
  const typeCell = page.getByRole("combobox", { name: cellName(M.type, fr) });
  await expect(typeCell).toHaveValue("FR");
  await typeCell.selectOption("TR");
  await expect(page.getByText(messages.datasheet.saved(M.type))).toBeAttached();

  await page.goto(`${REGISTER}&q=${encodeURIComponent(fr)}`);
  await openRow(page, fr);
  const form = page.getByTestId("requirement-form");
  await expect(form).toBeVisible();
  const typeField = form.getByLabel(M.type, { exact: true });
  await expect(typeField).toHaveValue("TR");

  const validates = picker(form, "validatesIds[]");
  await validates.getByRole("combobox").fill(br);
  await validates.getByRole("option").first().click();
  await expect(chips(validates)).toHaveCount(1);
  await page.getByTestId("requirement-save").click();
  await expect(form).toHaveCount(0);

  // With a link it keeps its own cell read-only and the sheet offers solution types only.
  await page.goto(`${REGISTER}&q=${encodeURIComponent(fr)}`);
  await expect(page.getByRole("combobox", { name: cellName(M.type, fr) })).toHaveCount(0);
  await openRow(page, fr);
  await expect(form).toBeVisible();
  await expect(typeField.getByRole("option")).toHaveCount(3);
  await expect(typeField.getByRole("option", { name: /^Business/ })).toHaveCount(0);
});

test("the type filter lists one kind and starts a new row with it", async ({ page }) => {
  const stamp = Date.now();
  const br = `E2E filtered need ${stamp}`;

  await page.goto(`${REGISTER}&q=${stamp}`);
  await addRequirement(page, "BR", br);

  await page.getByTestId("filter-type").selectOption("NFR");
  await expect(page).toHaveURL(/type=NFR/);
  await expect(page.getByRole("textbox", { name: cellName(M.requirement, br) })).toHaveCount(0);
  await expect(
    page.getByTestId("datasheet-add-row").getByRole("combobox", { name: newEntry(M.type) }),
  ).toHaveValue("NFR");
});

test("the register fits a 360 px screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(REGISTER);
  await expect(page.getByRole("heading", { name: M.title })).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);
});

/**
 * Sub-requirements (ADR-0048). The client asked for FR-1, then FR-1.1, then FR-1.1.1, and sent a
 * mock-up: a child is indented, its Type column reads "Sub-Requirement", and its reference carries
 * its parent's letters. The tree lives in SQL — the path is a recursive walk and the numbering is
 * per parent — so this checks what the browser does with it, and that the WBS, which is a second
 * surface rendering the same reference, agrees with the register about an allocated child.
 *
 * Every state here is built through the surface the test is allowed to use: the parent is created
 * in the new-entry row, each child through the row's own "Add sub-requirement" (LESSONS §37 — a
 * state the UI cannot reach is not a state to assert about).
 */
test("sub-requirements: the register nests them, and the WBS names them the same way", async ({
  page,
}) => {
  const stamp = Date.now();
  const parent = `E2E parent requirement ${stamp}`;
  const childA = `E2E first sub-requirement ${stamp}`;
  const childB = `E2E second sub-requirement ${stamp}`;
  const grandchild = `E2E nested sub-requirement ${stamp}`;

  await page.goto(`${REGISTER}&q=${stamp}`);
  await expect(page.getByRole("heading", { name: M.title })).toBeVisible();

  await addRequirement(page, "FR", parent);
  const parentRef = await refOf(page, parent);
  expect(parentRef).toMatch(/^FR-\d+$/);

  /** Adds a sub-requirement under the row holding `under`, through that row's own action. */
  async function addSub(under: string, text: string): Promise<void> {
    const row = rowOf(page, under);
    await expect(row).toBeVisible();
    // The button's aria-label replaces its text for the accessible name (LESSONS §36), so it is
    // "Add a sub-requirement under FR-1", not the column header. Scoped to the row, so the prefix
    // is unambiguous, and asserting the descriptive name is what a screen reader actually hears.
    await row.getByRole("button", { name: /^Add a sub-requirement under / }).click();
    await expect(page).toHaveURL(/id=new&?.*parent=\d+|parent=\d+&?.*id=new/);

    const form = page.getByTestId("requirement-form");
    await expect(form).toBeVisible();
    // The parent is named and the type is its parent's: no select to get wrong.
    await expect(page.getByTestId("requirement-parent")).toBeVisible();
    await expect(page.getByTestId("requirement-type-fixed")).toContainText("FR");
    await expect(form.getByRole("combobox", { name: M.type, exact: true })).toHaveCount(0);

    await form.getByLabel(M.requirement, { exact: true }).fill(text);
    await page.getByTestId("requirement-save").click();
    await expect(
      page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
    ).toBeVisible();
    await expect(form).toHaveCount(0);
  }

  await addSub(parent, childA);
  await page.goto(`${REGISTER}&q=${stamp}`);
  await addSub(parent, childB);

  // Both children are numbered under the parent, from 1, and read as sub-requirements.
  await page.goto(`${REGISTER}&q=${encodeURIComponent(`sub-requirement ${stamp}`)}`);
  await expectListed(page, childA);
  expect(await refOf(page, childA)).toBe(`${parentRef}.1`);
  expect(await refOf(page, childB)).toBe(`${parentRef}.2`);
  await expect(rowOf(page, childA)).toContainText(M.subRequirement);

  // A third level, under the first child.
  await page.goto(`${REGISTER}&q=${encodeURIComponent(childA)}`);
  await addSub(childA, grandchild);
  await page.goto(`${REGISTER}&q=${encodeURIComponent(grandchild)}`);
  expect(await refOf(page, grandchild)).toBe(`${parentRef}.1.1`);

  // The parent cannot be deleted or retyped while they are under it: the register says so instead
  // of letting the save fail (ADR-0048 decisions 8 and 9, both refusals until the client chooses).
  await page.goto(`${REGISTER}&q=${encodeURIComponent(parent)}`);
  await openRow(page, parent);
  await expect(page.getByTestId("requirement-form")).toBeVisible();
  await expect(page.getByTestId("requirement-delete-blocked")).toBeVisible();
  await expect(page.getByTestId("requirement-delete")).toHaveCount(0);
  await expect(page.getByTestId("requirement-type-fixed")).toBeVisible();
  await page.keyboard.press("Escape");

  // Allocate the first child to a deliverable, then read the chip the WBS draws for it: the whole
  // path, not the parent's reference. This is the surface ADR-0046 shipped a defect on.
  await page.goto(`${REGISTER}&q=${encodeURIComponent(childA)}`);
  await openRow(page, childA);
  const form = page.getByTestId("requirement-form");
  await expect(form).toBeVisible();
  const deliverables = picker(form, "deliverableIds[]");
  await pickFirst(deliverables);
  await expect(deliverables.getByRole("listbox")).toBeHidden();
  await page.getByTestId("requirement-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.saved }).first(),
  ).toBeVisible();

  await page.goto("/projects/2/deliverables/gantt?view=wbs");
  await openRequirementLists(page);
  // The box view lists a deliverable's requirements as li[data-testid="wbs-req-<id>"], each a
  // RefChip beside the text.
  const chipRow = page.locator('li[data-testid^="wbs-req-"]').filter({ hasText: childA });
  await expect(chipRow.first()).toContainText(`${parentRef}.1`, { timeout: 15_000 });
});

test("WBS quick add: Meets traces the new requirement to a business need", async ({ page }) => {
  test.slow();
  const stamp = Date.now();
  const br = `E2E need met from the WBS ${stamp}`;
  const fr = `E2E solution added in the WBS ${stamp}`;

  await page.goto(`${REGISTER}&q=${stamp}`);
  await expect(page.getByRole("heading", { name: M.title })).toBeVisible();
  await closeAlarmToast(page);
  await addRequirement(page, "BR", br);
  const brRef = await refOf(page, br);

  await page.goto("/projects/2/deliverables/gantt?view=wbs");
  const diagram = page.getByTestId("wbs-diagram");
  await expect(diagram).toBeVisible();
  await page.getByTestId("wbs-add").click();
  const name = page.locator("input:focus");
  await expect(name).toHaveValue(W.newItemName, { timeout: 15_000 });
  await name.fill(`E2E meets ${stamp}`);
  await name.press("Enter");
  const item = diagram.getByRole("treeitem", { name: new RegExp(`E2E meets ${stamp}`) });
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });
  const id = await item.getAttribute("data-wbs-box");

  await page.getByTestId(`wbs-req-add-${id}`).click();
  const add = page.getByLabel(W.newRequirementFor(""), { exact: false });
  await expect(add).toBeFocused({ timeout: 15_000 });
  await add.fill(fr);
  await page.getByTestId(`wbs-req-meets-${id}`).selectOption({ label: `${brRef} ${br}` });
  await add.press("Enter");
  await add.press("Escape");
  await expect(
    page.getByTestId(`wbs-reqs-${id}`).locator("li").filter({ hasText: fr }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("wbs-saving")).toBeHidden({ timeout: 15_000 });

  await page.goto(`${REGISTER}&q=${encodeURIComponent(fr)}`);
  await expectListed(page, fr);
  await expect(rowOf(page, fr)).toContainText(brRef);
  await page.goto(`${REGISTER}&q=${encodeURIComponent(br)}`);
  await expect(rowOf(page, br)).toContainText(M.coveragePartial(0, 1));
});
