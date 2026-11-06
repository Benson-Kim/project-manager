import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";

const M = messages.requirements.canvas;
const R = messages.requirements;
const W = messages.keyDeliverables.wbs;

async function createProject(page: Page): Promise<string> {
  await page.goto("/projects/new");
  await page.getByLabel(messages.projects.name).fill(`E2E canvas project ${Date.now()}`);
  await page.getByTestId("project-save").click();
  await page.waitForURL(/\/projects\/\d+/);
  return new URL(page.url()).pathname.split("/")[2];
}

async function createCanvas(page: Page, canvasPath: string): Promise<void> {
  await page.getByLabel(M.nameLabel).fill(`E2E canvas ${Date.now()}`);
  await page.getByRole("button", { name: M.create, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${canvasPath}\\?canvas=\\d+$`), { timeout: 30_000 });
  await expect(page.getByTestId("canvas-board")).toBeVisible();
}

async function addRequirement(page: Page, projectId: string, type: string, title: string) {
  await page.goto(`/projects/${projectId}/requirements?view=list`);
  const addRow = page.getByTestId("datasheet-add-row");
  const field = addRow.getByRole("textbox", {
    name: messages.datasheet.newEntryField(R.requirement),
  });
  await addRow
    .getByRole("combobox", { name: messages.datasheet.newEntryField(R.type) })
    .selectOption(type);
  await field.fill(title);
  await field.press("Enter");
  await expect(field).toHaveValue("", { timeout: 15_000 });
}

/** Adds a top-level WBS item from the WBS diagram. */
async function addWbsItem(page: Page, projectId: string, name: string) {
  await page.goto(`/projects/${projectId}/deliverables/gantt`);
  await expect(page.getByTestId("wbs-add")).toBeVisible();
  await closeAlarmToast(page);
  await page.getByTestId("wbs-add").click();
  const field = page.locator("input:focus");
  await expect(field).toHaveValue(W.newItemName, { timeout: 15_000 });
  await field.fill(name);
  await field.press("Enter");
  await expect(
    page.getByTestId("wbs-diagram").getByRole("treeitem", { name: new RegExp(name) }),
  ).toBeVisible({ timeout: 15_000 });
}

/** Adds a sub-requirement under the register row holding `under`. */
async function addSubRequirement(page: Page, projectId: string, under: string, text: string) {
  await page.goto(`/projects/${projectId}/requirements?view=list`);
  const row = page.getByRole("row").filter({
    has: page.getByRole("textbox", {
      name: messages.datasheet.cellLabel(R.requirement, under),
      exact: true,
    }),
  });
  await row.getByRole("button", { name: /^Add a sub-requirement under / }).click();
  const form = page.getByTestId("requirement-form");
  await expect(form).toBeVisible();
  await form.getByLabel(R.requirement, { exact: true }).fill(text);
  await page.getByTestId("requirement-save").click();
  await expect(form).toHaveCount(0, { timeout: 15_000 });
}

/** A new canvas with every requirement of the project placed on it. */
async function canvasWithAll(page: Page, projectId: string, count: number): Promise<void> {
  const canvasPath = `/projects/${projectId}/deliverables/canvas`;
  await page.goto(canvasPath);
  await createCanvas(page, canvasPath);
  for (let placed = 1; placed <= count; placed += 1) {
    await page
      .getByRole("button", { name: /^Add .+ to the canvas$/ })
      .first()
      .click();
    await expect(page.getByTestId("canvas-on-count")).toHaveText(M.onCanvasCount(placed));
  }
}

/** Server actions are POSTs carrying a Next-Action header; node moves are the only ones while idle. */
function countActions(page: Page): () => number {
  let count = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"]) count += 1;
  });
  return () => count;
}

test("a new project names its first canvas, lands on it, and the tab reopens it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const canvasPath = `/projects/${await createProject(page)}/deliverables/canvas`;
  await page.goto(canvasPath);
  await expect(page.getByText(M.none)).toBeVisible();
  await page.getByRole("button", { name: M.create, exact: true }).click();
  await expect(page).not.toHaveURL(/canvas=/);

  await createCanvas(page, canvasPath);
  await expect(page.locator(".react-flow")).toBeVisible();

  await page.goto(canvasPath);
  await expect(page.getByTestId("canvas-board")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a node saves a drag and a key move once each, keeps them on reload, and Auto layout asks first", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const title = `E2E canvas need ${Date.now()}`;

  await addRequirement(page, projectId, "BR", title);
  await canvasWithAll(page, projectId, 1);
  const node = page.locator(".react-flow__node").filter({ hasText: title });
  await expect(node).toBeVisible();

  const actions = countActions(page);
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + 92, { steps: 12 });
  await page.mouse.up();
  await expect.poll(actions, { timeout: 5_000 }).toBe(1);
  await page.waitForTimeout(800);
  expect(actions()).toBe(1);
  const dragged = await node.evaluate((el) => (el as HTMLElement).style.transform);

  await node.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(actions, { timeout: 5_000 }).toBe(2);
  await page.waitForTimeout(800);
  expect(actions()).toBe(2);
  const keyed = await node.evaluate((el) => (el as HTMLElement).style.transform);
  expect(keyed).not.toBe(dragged);

  await page.reload();
  await expect(node).toBeVisible();
  expect(await node.evaluate((el) => (el as HTMLElement).style.transform)).toBe(keyed);

  await page.getByRole("button", { name: M.autoLayout, exact: true }).click();
  await expect(page.getByText(M.autoLayoutBody)).toBeVisible();

  const board = page.locator(".react-flow");
  const background = () => board.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.emulateMedia({ colorScheme: "light" });
  const light = await background();
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await background();
  expect(dark).not.toBe(light);
  expect(dark).not.toBe("rgb(255, 255, 255)");
  expect(errors).toEqual([]);
});

test("a requirement opens in the inspector beside the board and closes again", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const title = `E2E inspected need ${Date.now()}`;
  await addRequirement(page, projectId, "BR", title);
  await canvasWithAll(page, projectId, 1);

  await page.locator(".react-flow__node").filter({ hasText: title }).click({ button: "right" });
  await page.getByTestId("canvas-menu-inspect").click();
  const inspector = page.getByTestId("canvas-inspector");
  await expect(inspector).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/[?&]inspect=\d+/);
  await expect(inspector.getByText(title, { exact: true })).toBeVisible();
  await expect(inspector.getByTestId("requirement-links")).toBeVisible();
  await expect(page.getByTestId("canvas-on-count")).toHaveText(M.onCanvasCount(1));

  await inspector.getByTestId("canvas-inspector-close").click();
  await expect(inspector).toBeHidden({ timeout: 15_000 });
  await expect(page).not.toHaveURL(/inspect=/);
  expect(errors).toEqual([]);
});

test("picking from the menu dims a wrong end, draws a link, and the link's menu removes it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const business = `E2E business need ${stamp}`;
  const stakeholder = `E2E stakeholder need ${stamp}`;
  await addRequirement(page, projectId, "BR", business);
  await addRequirement(page, projectId, "SR", stakeholder);
  await canvasWithAll(page, projectId, 2);

  const nodes = page.locator(".react-flow__node");
  const edges = page.locator(".react-flow__edge");
  const picking = page.getByTestId("canvas-picking");
  const dimmed = page.locator('[data-dimmed="true"]');
  await expect(edges).toHaveCount(0);

  await nodes.filter({ hasText: stakeholder }).click({ button: "right" });
  await page.getByTestId("canvas-menu-link-downstream").click();
  await expect(picking).toBeVisible();
  await expect(dimmed.filter({ hasText: business })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(picking).toBeHidden();
  await expect(dimmed).toHaveCount(0);

  await nodes.filter({ hasText: business }).click({ button: "right" });
  await page.getByTestId("canvas-menu-link-downstream").click();
  await expect(picking).toBeVisible();
  await expect(dimmed).toHaveCount(0);
  await nodes.filter({ hasText: stakeholder }).click();
  await expect(picking).toBeHidden();
  await expect(edges).toHaveCount(1, { timeout: 15_000 });

  await page.reload();
  await expect(nodes).toHaveCount(2);
  await expect(edges).toHaveCount(1);

  await edges.first().click({ button: "right", force: true });
  await page.getByTestId("canvas-menu-remove-link").click();
  await expect(edges).toHaveCount(0, { timeout: 15_000 });
  await page.reload();
  await expect(nodes).toHaveCount(2);
  await expect(edges).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("focus shows a card's links only, and the board goes full page, to a preview, and to print", async ({
  page,
}) => {
  const projectId = await createProject(page);
  const stamp = Date.now();
  const business = `E2E focus business ${stamp}`;
  const stakeholder = `E2E focus stakeholder ${stamp}`;
  const loose = `E2E focus loose ${stamp}`;
  await addRequirement(page, projectId, "BR", business);
  await addRequirement(page, projectId, "SR", stakeholder);
  await addRequirement(page, projectId, "BR", loose);
  await canvasWithAll(page, projectId, 3);

  const nodes = page.locator(".react-flow__node");
  await nodes.filter({ hasText: business }).click({ button: "right" });
  await page.getByTestId("canvas-menu-link-downstream").click();
  await nodes.filter({ hasText: stakeholder }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1, { timeout: 15_000 });

  await nodes.filter({ hasText: business }).click({ button: "right" });
  await page.getByTestId("canvas-menu-focus").click();
  await expect(page.getByTestId("canvas-focus")).toBeVisible();
  await expect(nodes.filter({ hasText: loose })).toBeHidden();
  await expect(nodes.filter({ hasText: stakeholder })).toBeVisible();
  await page.getByTestId("canvas-focus-trace").click();
  await expect(page.getByTestId("canvas-focus-trace")).toBeHidden();
  await page.getByTestId("canvas-focus-clear").click();
  await expect(page.getByTestId("canvas-focus")).toBeHidden();
  await expect(nodes.filter({ hasText: loose })).toBeVisible();

  const view = page.locator("[data-canvas-view]");
  const repository = page.getByRole("searchbox").first();
  await page.getByTestId("canvas-full-page").click();
  await expect(view).toHaveAttribute("data-canvas-view", "full");
  await page.keyboard.press("Escape");
  await expect(view).toHaveAttribute("data-canvas-view", "board");

  await page.getByTestId("canvas-preview").click();
  await expect(view).toHaveAttribute("data-canvas-view", "preview");
  await expect(repository).toBeHidden();
  const box = await page.getByTestId("canvas-board").boundingBox();
  expect(box && [Math.round(box.width), Math.round(box.height)]).toEqual([1040, 712]);
  await page.getByTestId("canvas-close-preview").click();
  await expect(view).toHaveAttribute("data-canvas-view", "board");

  await page.evaluate(() => {
    window.print = () => document.body.setAttribute("data-e2e-printed", "yes");
  });
  await page.getByTestId("canvas-print").click();
  await expect(page.locator("body")).toHaveAttribute("data-e2e-printed", "yes");
  await expect(view).toHaveAttribute("data-canvas-view", "preview");

  await page.getByTestId("canvas-close-preview").click();
  await page.emulateMedia({ media: "print" });
  await expect(repository).toBeHidden();
  await expect(page.getByTestId("canvas-board")).toBeVisible();
  await expect(nodes.filter({ hasText: business })).toBeVisible();
  await page.emulateMedia({ media: "screen" });
});

test("a WBS item labels its group, and a parent folds its sub-requirement and keeps it folded", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const wbs = `E2E canvas phase ${stamp}`;
  const parent = `E2E fold parent ${stamp}`;
  const child = `E2E fold child ${stamp}`;
  await addWbsItem(page, projectId, wbs);
  await addRequirement(page, projectId, "FR", parent);
  await addSubRequirement(page, projectId, parent, child);
  await canvasWithAll(page, projectId, 3);

  const labels = page.getByTestId("canvas-cluster-label");
  await expect(labels).toHaveCount(1);
  await expect(labels.first()).toContainText(wbs);

  const nodes = page.locator(".react-flow__node");
  const parentNode = nodes.filter({ hasText: parent });
  const childNode = nodes.filter({ hasText: child });
  const fold = parentNode.getByTestId("canvas-node-collapse");
  await expect(nodes.filter({ hasText: wbs }).getByTestId("canvas-node-collapse")).toHaveCount(0);
  await expect(fold).toHaveAttribute("aria-expanded", "true");

  const actions = countActions(page);
  await fold.click();
  await expect(childNode).toBeHidden();
  await expect(parentNode.getByTestId("canvas-hidden-count")).toHaveText(M.hiddenCount(1));
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect.poll(actions, { timeout: 5_000 }).toBe(1);

  await page.reload();
  await expect(parentNode).toBeVisible();
  await expect(childNode).toBeHidden();
  await expect(parentNode.getByTestId("canvas-hidden-count")).toHaveText(M.hiddenCount(1));
  await expect(labels).toHaveCount(1);

  await fold.click();
  await expect(childNode).toBeVisible();
  await expect(parentNode.getByTestId("canvas-hidden-count")).toHaveCount(0);
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(scan.violations).toEqual([]);
  expect(errors).toEqual([]);
});
