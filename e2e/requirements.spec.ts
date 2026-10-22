import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
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
const REF = /\b(?:BR|SR|FR|NFR|TR)-\d+\b/;

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

  await page.goto(REGISTER);
  await expect(page.getByRole("heading", { name: M.title })).toBeVisible();
  await axe(page);

  await addRequirement(page, "BR", br);
  await addRequirement(page, "SR", sr);
  const brRef = await refOf(page, br);
  const srRef = await refOf(page, sr);
  expect(brRef).toMatch(/^BR-\d+$/);
  expect(srRef).toMatch(/^SR-\d+$/);
  // A need carries no met tick and no coverage until a solution validates it.
  await expect(rowOf(page, br)).toContainText(M.coverageNone);
  await expect(page.getByRole("combobox", { name: cellName(M.met, br) })).toHaveCount(0);

  // Selecting the two needs offers the merge; it opens the sheet as a new solution.
  await page.getByRole("checkbox", { name: messages.list.selectRow(br) }).check();
  await page.getByRole("checkbox", { name: messages.list.selectRow(sr) }).check();
  await page.getByTestId("requirements-merge").click();
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

  await page.goto(REGISTER);
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

  await page.goto(REGISTER);
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
