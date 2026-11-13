import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { RESPONSIBILITY_FRAMEWORKS } from "../src/modules/stakeholders/schemas/responsibility-frameworks";
import { closeAlarmToast } from "./support/alarms";
import { openListed } from "./support/datasheet";
import { waitForRichTextEditors } from "./support/editor";

/**
 * Responsibility matrix on project 2, as e2e-pm. Each test makes its own deliverable, people and
 * matrix, so nothing here touches seeded rows or another test's cells.
 */

const R = messages.responsibility;
const S = messages.stakeholders;
const PAGE = "/projects/2/responsibility";
const RACI = RESPONSIBILITY_FRAMEWORKS.find((f) => f.code === "RACI")!;
const abbrev = (code: string) => RACI.roles.find((r) => r.code === code)!.abbrev;

type Framework = (typeof RESPONSIBILITY_FRAMEWORKS)[number];
const roleTags = (framework: Framework) => framework.roles.map((r) => `${r.abbrev} ${r.label}`);

async function createToast(page: Page): Promise<void> {
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

async function createStakeholder(page: Page, firstName: string): Promise<void> {
  await page.goto("/projects/2/stakeholders?id=new");
  const form = page.getByTestId("stakeholder-form");
  await expect(form).toBeVisible();
  await form.getByLabel(S.firstName).fill(firstName);
  await page.getByTestId("stakeholder-save").click();
  await createToast(page);
  await expect(form).toHaveCount(0);
}

async function createDeliverable(page: Page, name: string): Promise<void> {
  await page.goto("/projects/2/deliverables?d=new");
  const form = page.getByTestId("deliverable-form");
  await form.getByLabel(messages.keyDeliverables.deliverable).fill(name);
  await form.getByLabel(messages.keyDeliverables.deadline).fill("2027-03-31");
  await page.getByTestId("deliverable-save").click();
  await createToast(page);
}

function dialogOf(page: Page, title: string): Locator {
  return page.getByRole("dialog", { name: title });
}

function matrixMenu(page: Page): Locator {
  return page.getByTestId("responsibility-matrix-menu");
}

function legendOf(scope: Page | Locator): Locator {
  return scope.getByRole("list", { name: R.legend }).getByRole("listitem");
}

/** Creates a matrix from the matrix menu; the dialog previews the framework's roles first. */
async function createMatrix(page: Page, name: string, framework: Framework = RACI): Promise<void> {
  await page.goto(PAGE);
  await matrixMenu(page).click();
  await page.getByTestId("responsibility-matrix-new").click();
  const dialog = dialogOf(page, R.newMatrix);
  await dialog.getByTestId("responsibility-new-name").fill(name);
  await dialog.getByTestId("responsibility-new-framework").selectOption({ label: framework.label });
  await expect(dialog.getByTestId("responsibility-new-rows")).toHaveValue(framework.defaultRowKind);
  await expect(legendOf(dialog)).toHaveText(roleTags(framework));
  await dialog.getByTestId("responsibility-new-save").click();
  await expect(dialog).toHaveCount(0);
  await expect(matrixMenu(page)).toContainText(name);
  await expect(legendOf(page)).toHaveText(roleTags(framework));
}

async function chooseMatrix(page: Page, name: string): Promise<void> {
  await matrixMenu(page).click();
  await page.getByTestId("responsibility-matrix-item").filter({ hasText: name }).click();
  await expect(matrixMenu(page)).toContainText(name);
}

async function addMember(page: Page, name: string): Promise<void> {
  await page
    .getByRole("combobox", { name: R.addMember, exact: true })
    .selectOption({ label: name });
  await expect(page.getByRole("columnheader", { name })).toBeVisible();
}

async function allSaved(page: Page): Promise<void> {
  await expect(page.getByTestId("responsibility-saving")).toHaveAttribute("data-status", "saved");
}

function cell(page: Page, deliverable: string, person: string): Locator {
  return page.locator(`select[aria-label$="${deliverable} — ${person}"]`);
}

function rowOf(page: Page, deliverable: string): Locator {
  return page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: deliverable }) });
}

async function setRole(
  page: Page,
  deliverable: string,
  person: string,
  code: string,
): Promise<void> {
  const box = cell(page, deliverable, person);
  await box.selectOption({ value: code });
  await expect(box).toHaveValue(code);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("the role tags list the framework's roles and a new matrix starts without members", async ({
  page,
}) => {
  const matrix = `E2E matrix ${Date.now()}`;
  await createMatrix(page, matrix);
  await expect(legendOf(page)).toHaveText(roleTags(RACI));
  await expect(page.getByRole("combobox", { name: R.addMember, exact: true })).toBeVisible();
  await expect(page.getByTestId("responsibility-member")).toHaveCount(0);
});

test("roles are set per person, flagged when missing or doubled, and survive a reload", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const stamp = Date.now();
  const deliverable = `E2E row ${stamp}`;
  const ann = `E2E Ann ${stamp}`;
  const bo = `E2E Bo ${stamp}`;
  const matrix = `E2E matrix ${stamp}`;
  await createDeliverable(page, deliverable);
  await createStakeholder(page, ann);
  await createStakeholder(page, bo);
  await createMatrix(page, matrix);
  await addMember(page, ann);
  await addMember(page, bo);

  const row = rowOf(page, deliverable);
  await expect(row).toContainText(
    `${R.missing}: ${abbrev("RESPONSIBLE")}, ${abbrev("ACCOUNTABLE")}`,
  );

  await setRole(page, deliverable, ann, "RESPONSIBLE");
  await expect(row).toContainText(`${R.missing}: ${abbrev("ACCOUNTABLE")}`);
  await expect(row).not.toContainText(`${R.missing}: ${abbrev("RESPONSIBLE")}`);

  await setRole(page, deliverable, bo, "ACCOUNTABLE");
  await expect(row).not.toContainText(R.missing);

  await setRole(page, deliverable, bo, "CONSULTED");
  await expect(row).toContainText(`${R.missing}: ${abbrev("ACCOUNTABLE")}`);

  await page.reload();
  await expect(cell(page, deliverable, ann)).toHaveValue("RESPONSIBLE");
  await expect(cell(page, deliverable, bo)).toHaveValue("CONSULTED");
  await axe(page);
});

test("a second Accountable is refused until the move is confirmed, then the first one is cleared", async ({
  page,
}) => {
  const stamp = Date.now();
  const deliverable = `E2E one ${stamp}`;
  const ann = `E2E Ann ${stamp}`;
  const bo = `E2E Bo ${stamp}`;
  await createDeliverable(page, deliverable);
  await createStakeholder(page, ann);
  await createStakeholder(page, bo);
  await createMatrix(page, `E2E matrix ${stamp}`);
  await addMember(page, ann);
  await addMember(page, bo);

  await setRole(page, deliverable, ann, "ACCOUNTABLE");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await cell(page, deliverable, bo).selectOption({ value: "ACCOUNTABLE" });
  const move = dialogOf(page, R.moveSingleTitle("Accountable"));
  await expect(move).toContainText(R.moveSinglePrompt("Accountable", [ann]));
  await move.getByRole("button", { name: R.move, exact: true }).click();
  await expect(cell(page, deliverable, bo)).toHaveValue("ACCOUNTABLE");
  await expect(cell(page, deliverable, ann)).toHaveValue("");

  await page.reload();
  await expect(cell(page, deliverable, ann)).toHaveValue("");
  await expect(cell(page, deliverable, bo)).toHaveValue("ACCOUNTABLE");
});

test("a declined move leaves the Accountable where it was", async ({ page }) => {
  const stamp = Date.now();
  const deliverable = `E2E keep ${stamp}`;
  const ann = `E2E Ann ${stamp}`;
  const bo = `E2E Bo ${stamp}`;
  await createDeliverable(page, deliverable);
  await createStakeholder(page, ann);
  await createStakeholder(page, bo);
  await createMatrix(page, `E2E matrix ${stamp}`);
  await addMember(page, ann);
  await addMember(page, bo);
  await setRole(page, deliverable, ann, "ACCOUNTABLE");

  await cell(page, deliverable, bo).selectOption({ value: "ACCOUNTABLE" });
  const move = dialogOf(page, R.moveSingleTitle("Accountable"));
  await move.getByRole("button", { name: messages.actions.cancel }).click();
  await expect(move).toHaveCount(0);

  await expect(cell(page, deliverable, ann)).toHaveValue("ACCOUNTABLE");
  await expect(cell(page, deliverable, bo)).toHaveValue("");
});

test("columns move, and removing one deletes its cells after a confirmation", async ({ page }) => {
  const stamp = Date.now();
  const deliverable = `E2E cols ${stamp}`;
  const ann = `E2E Ann ${stamp}`;
  const bo = `E2E Bo ${stamp}`;
  await createDeliverable(page, deliverable);
  await createStakeholder(page, ann);
  await createStakeholder(page, bo);
  await createMatrix(page, `E2E matrix ${stamp}`);
  await addMember(page, ann);
  await addMember(page, bo);
  await setRole(page, deliverable, bo, "CONSULTED");

  const heads = page.getByRole("columnheader");
  await expect(heads.nth(1)).toContainText(ann);
  await page
    .getByRole("columnheader", { name: bo })
    .getByRole("button", { name: R.moveLeft(bo) })
    .click();
  await expect(heads.nth(1)).toContainText(bo);
  await allSaved(page);
  await page.reload();
  await expect(heads.nth(1)).toContainText(bo);

  await page
    .getByRole("columnheader", { name: ann })
    .dragTo(page.getByRole("columnheader", { name: bo }), {
      sourcePosition: { x: 8, y: 8 },
      targetPosition: { x: 8, y: 8 },
    });
  await expect(heads.nth(1)).toContainText(ann);
  await allSaved(page);
  await page.reload();
  await expect(heads.nth(1)).toContainText(ann);

  await page
    .getByRole("columnheader", { name: bo })
    .getByRole("button", { name: R.remove(bo) })
    .click();
  const removal = dialogOf(page, R.removeTitle(bo));
  await expect(removal).toContainText(R.removeBody);
  await removal.getByRole("button", { name: R.removeAction, exact: true }).click();
  await expect(page.getByRole("columnheader", { name: bo })).toHaveCount(0);

  await addMember(page, bo);
  await expect(cell(page, deliverable, bo)).toHaveValue("");
});

test("a matrix is renamed and deleted, and the empty state returns with the last one", async ({
  page,
}) => {
  const stamp = Date.now();
  const matrix = `E2E matrix ${stamp}`;
  await createMatrix(page, matrix);

  const renamed = `${matrix} renamed`;
  await matrixMenu(page).click();
  await page.getByTestId("responsibility-matrix-rename").click();
  const rename = dialogOf(page, R.renameTitle);
  await rename.getByRole("textbox", { name: R.name }).fill(renamed);
  await rename.getByRole("button", { name: messages.actions.save }).click();
  await expect(matrixMenu(page)).toContainText(renamed);

  await matrixMenu(page).click();
  await page.getByTestId("responsibility-matrix-delete").click();
  const removal = dialogOf(page, R.deleteTitle(renamed));
  await expect(removal).toContainText(R.deleteBody);
  await removal.getByRole("button", { name: R.delete, exact: true }).click();
  await expect(matrixMenu(page)).not.toContainText(renamed);
  await matrixMenu(page).click();
  await expect(
    page.getByTestId("responsibility-matrix-item").filter({ hasText: renamed }),
  ).toHaveCount(0);
});

test("the matrix is copied as CSV with member names across and role letters in the cells", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const stamp = Date.now();
  const deliverable = `E2E csv ${stamp}`;
  const ann = `E2E Ann ${stamp}`;
  const bo = `E2E Bo ${stamp}`;
  await createDeliverable(page, deliverable);
  await createStakeholder(page, ann);
  await createStakeholder(page, bo);
  await createMatrix(page, `E2E matrix ${stamp}`);
  await addMember(page, ann);
  await addMember(page, bo);
  await setRole(page, deliverable, ann, "RESPONSIBLE");

  await page.getByTestId("responsibility-copy-csv").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: R.csvCopied }).first(),
  ).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const lines = copied.split("\n").map((line) => line.replace(/\r$/, ""));
  expect(lines[0]).toBe(`${R.rowKinds.WbsItem},${ann},${bo}`);
  expect(lines.some((line) => line.endsWith(` ${deliverable},${abbrev("RESPONSIBLE")},`))).toBe(
    true,
  );
});

test("a refused save shows a notice, frees the cells, and the same cell saves once the network is back", async ({
  page,
}) => {
  const stamp = Date.now();
  const deliverable = `E2E net ${stamp}`;
  const ann = `E2E Ann ${stamp}`;
  await createDeliverable(page, deliverable);
  await createStakeholder(page, ann);
  await createMatrix(page, `E2E matrix ${stamp}`);
  await addMember(page, ann);

  const refuse = (route: Route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"]
      ? route.abort("failed")
      : route.continue();
  await page.route("**/projects/2/responsibility**", refuse);
  await cell(page, deliverable, ann).selectOption({ value: "RESPONSIBLE" });
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toBeVisible();
  await allSaved(page);
  await expect(cell(page, deliverable, ann)).toBeEnabled();

  await page.unroute("**/projects/2/responsibility**", refuse);
  await setRole(page, deliverable, ann, "CONSULTED");
  await page.reload();
  await expect(cell(page, deliverable, ann)).toHaveValue("CONSULTED");
});

test("another project's matrix is not reachable by its id", async ({ page }) => {
  const stamp = Date.now();
  await createMatrix(page, `E2E matrix ${stamp}`);
  const id = new URL(page.url()).searchParams.get("m");
  test.skip(!id, "the page does not put the chosen matrix in the address");
  const other = await page.goto(`/projects/1/responsibility?m=${id}`);
  expect(other?.status()).toBeLessThan(500);
  await expect(page.getByText(`E2E matrix ${stamp}`)).toHaveCount(0);
});

test("undo and redo replay a move on both cells, from the buttons and the keyboard", async ({
  page,
}) => {
  const stamp = Date.now();
  const deliverable = `E2E undo ${stamp}`;
  const ann = `E2E Ann ${stamp}`;
  const bo = `E2E Bo ${stamp}`;
  await createDeliverable(page, deliverable);
  await createStakeholder(page, ann);
  await createStakeholder(page, bo);
  await createMatrix(page, `E2E matrix ${stamp}`);
  await addMember(page, ann);
  await addMember(page, bo);
  const undo = page.getByTestId("responsibility-undo");
  const redo = page.getByTestId("responsibility-redo");
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await setRole(page, deliverable, ann, "ACCOUNTABLE");
  await cell(page, deliverable, bo).selectOption({ value: "ACCOUNTABLE" });
  await dialogOf(page, R.moveSingleTitle("Accountable"))
    .getByRole("button", { name: R.move, exact: true })
    .click();
  await expect(cell(page, deliverable, bo)).toHaveValue("ACCOUNTABLE");
  await expect(cell(page, deliverable, ann)).toHaveValue("");

  await undo.click();
  await expect(cell(page, deliverable, ann)).toHaveValue("ACCOUNTABLE");
  await expect(cell(page, deliverable, bo)).toHaveValue("");

  await redo.click();
  await expect(cell(page, deliverable, bo)).toHaveValue("ACCOUNTABLE");
  await expect(cell(page, deliverable, ann)).toHaveValue("");

  await expect(undo).toBeEnabled();
  await cell(page, deliverable, bo).focus();
  await page.keyboard.press("Control+z");
  await expect(cell(page, deliverable, ann)).toHaveValue("ACCOUNTABLE");
  await expect(cell(page, deliverable, bo)).toHaveValue("");

  await expect(redo).toBeEnabled();
  await cell(page, deliverable, bo).focus();
  await page.keyboard.press("Control+y");
  await expect(cell(page, deliverable, bo)).toHaveValue("ACCOUNTABLE");
  await expect(cell(page, deliverable, ann)).toHaveValue("");

  await expect(page.getByTestId("page-undo")).toBeEnabled();
  await page.getByTestId("page-undo").click();
  await expect(cell(page, deliverable, ann)).toHaveValue("ACCOUNTABLE");
  await expect(cell(page, deliverable, bo)).toHaveValue("");
  await expect(page.getByTestId("page-redo")).toBeEnabled();
  await page.getByTestId("page-redo").click();
  await expect(cell(page, deliverable, bo)).toHaveValue("ACCOUNTABLE");
  await expect(cell(page, deliverable, ann)).toHaveValue("");

  await expect(undo).toBeEnabled();
  await allSaved(page);
  await page.reload();
  await expect(cell(page, deliverable, bo)).toHaveValue("ACCOUNTABLE");
  await expect(cell(page, deliverable, ann)).toHaveValue("");
  await expect(undo).toBeDisabled();
});

test("a DACI matrix takes the decision register's decisions as its rows", async ({ page }) => {
  const stamp = Date.now();
  const DACI = RESPONSIBILITY_FRAMEWORKS.find((f) => f.code === "DACI")!;
  const decision = `E2E daci decision ${stamp}`;
  const ann = `E2E Ann ${stamp}`;
  const matrix = `E2E daci ${stamp}`;

  await page.goto("/projects/2/decisions?id=new");
  await closeAlarmToast(page);
  const form = page.getByTestId("decision-form");
  await expect(form).toBeVisible();
  await waitForRichTextEditors(form);
  await form.getByLabel(messages.decisions.decisionTitle, { exact: true }).fill(decision);
  await page.getByTestId("decision-save").click();
  await createToast(page);
  await createStakeholder(page, ann);

  expect(DACI.defaultRowKind).toBe("Decision");
  await createMatrix(page, matrix, DACI);

  await addMember(page, ann);
  await expect(
    page.getByRole("columnheader", { name: R.rowKinds.Decision, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("rowheader", { name: decision })).toBeVisible();
  await setRole(page, decision, ann, "DRIVER");
  await expect(cell(page, decision, ann)).toHaveClass(/bg-tone-blue-soft/);
  await allSaved(page);

  await page.reload();
  await expect(cell(page, decision, ann)).toHaveValue("DRIVER");
  const approver = DACI.roles.find((r) => r.code === "APPROVER")!.abbrev;
  await expect(rowOf(page, decision)).toContainText(`${R.missing}: ${approver}`);
  await axe(page);
});

test("R in the matrix and the deliverable's assignees stay one list, both ways", async ({
  page,
}) => {
  const stamp = Date.now();
  const K = messages.keyDeliverables;
  const deliverable = `E2E sync ${stamp}`;
  const ann = `E2E Ann ${stamp}`;
  const bo = `E2E Bo ${stamp}`;
  await createStakeholder(page, ann);
  await createStakeholder(page, bo);

  await page.goto("/projects/2/deliverables?d=new");
  const form = page.getByTestId("deliverable-form");
  await form.getByLabel(K.deliverable).fill(deliverable);
  await form.getByLabel(K.deadline).fill("2027-03-31");
  await form.getByLabel(K.assignees).fill(ann);
  await form.getByRole("listbox").getByRole("option", { name: ann }).click();
  await expect(form.getByRole("button", { name: K.removeAssignee(ann) })).toBeVisible();
  await page.getByTestId("deliverable-save").click();
  await createToast(page);

  await createMatrix(page, `E2E matrix ${stamp}`);
  await addMember(page, bo);
  await expect(rowOf(page, deliverable)).toContainText(
    `${R.notMember}: ${ann} (${abbrev("RESPONSIBLE")})`,
  );
  await addMember(page, ann);
  await expect(cell(page, deliverable, ann)).toHaveValue("RESPONSIBLE");
  await expect(rowOf(page, deliverable)).not.toContainText(R.notMember);

  await setRole(page, deliverable, bo, "RESPONSIBLE");
  await setRole(page, deliverable, ann, "");
  await allSaved(page);

  await page.goto(`/projects/2/deliverables?view=list&q=${stamp}`);
  await openListed(page, deliverable);
  const details = page.getByTestId("deliverable-form");
  await expect(details.getByRole("button", { name: K.removeAssignee(bo) })).toBeVisible();
  await expect(details.getByRole("button", { name: K.removeAssignee(ann) })).toHaveCount(0);
});

test("a cell changed in another tab is refused, shows the other tab's role, and leaves no undo step", async ({
  page,
}) => {
  const stamp = Date.now();
  const deliverable = `E2E stale ${stamp}`;
  const ann = `E2E Ann ${stamp}`;
  const matrix = `E2E matrix ${stamp}`;
  await createDeliverable(page, deliverable);
  await createStakeholder(page, ann);
  await createMatrix(page, matrix);
  await addMember(page, ann);
  await expect(cell(page, deliverable, ann)).toHaveValue("");

  const other = await page.context().newPage();
  await other.goto(PAGE);
  await chooseMatrix(other, matrix);
  await setRole(other, deliverable, ann, "CONSULTED");
  await allSaved(other);
  await other.close();

  await cell(page, deliverable, ann).selectOption({ value: "INFORMED" });
  await expect(page.getByRole("alert").filter({ hasText: messages.errors.CONFLICT })).toBeVisible();
  await expect(cell(page, deliverable, ann)).toHaveValue("CONSULTED");
  await allSaved(page);
  await expect(cell(page, deliverable, ann)).toBeEnabled();
  await expect(page.getByTestId("responsibility-undo")).toBeDisabled();

  await page.reload();
  await expect(cell(page, deliverable, ann)).toHaveValue("CONSULTED");
});
