import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
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
  const html = page.locator("html");
  // The theme follows a colour-scheme change from a media event the page handles later, so it is awaited.
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveAttribute("data-theme", "light");
  const light = await background();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveAttribute("data-theme", "dark");
  await expect.poll(background).not.toBe(light);
  expect(await background()).not.toBe("rgb(255, 255, 255)");
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
  const line = await edges.first().locator(".react-flow__edge-path").getAttribute("d");
  expect(line).not.toContain("C");
  expect(line).toMatch(/^M[ML\d\s.,-]+$/);

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
  await expect(page.getByTestId("canvas-focus")).toBeAttached();
  await expect(nodes.filter({ hasText: loose })).toBeHidden();
  await expect(nodes.filter({ hasText: stakeholder })).toBeVisible();
  await page.getByTestId("canvas-focus-trace").click();
  await expect(page.getByTestId("canvas-focus-trace")).toBeHidden();
  await page.getByTestId("canvas-focus-clear").click();
  await expect(page.getByTestId("canvas-focus")).toHaveCount(0);
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

type Spot = { x: number; y: number };

/** The two ends of an edge's drawn line, in board units. */
async function lineEnds(edge: Locator): Promise<{ start: Spot; end: Spot }> {
  return edge.locator(".react-flow__edge-path").evaluate((el) => {
    const path = el as SVGPathElement;
    const total = path.getTotalLength();
    const at = (length: number) => {
      const point = path.getPointAtLength(length);
      return { x: point.x, y: point.y };
    };
    return { start: at(0), end: at(total) };
  });
}

/** A card's box in board units, read from the position the board draws it at. */
async function cardBox(node: Locator) {
  return node.evaluate((el) => {
    const card = el as HTMLElement;
    const [x, y] = (card.style.transform.match(/-?[\d.]+/g) ?? ["0", "0"]).map(Number);
    return { x, y, width: card.offsetWidth, height: card.offsetHeight };
  });
}

async function dragBy(page: Page, node: Locator, dx: number, dy: number) {
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + 12 + dy, { steps: 12 });
  await page.mouse.up();
}

async function openLinkStyle(page: Page, edge: Locator) {
  await edge.click({ button: "right", force: true });
  await page.getByTestId("canvas-menu-style-link").click();
  await expect(page.getByTestId("canvas-link-style")).toBeVisible();
}

test("a link's style is saved, undoes in one step, and is kept after a reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const business = `E2E styled business ${stamp}`;
  const stakeholder = `E2E styled stakeholder ${stamp}`;
  await addRequirement(page, projectId, "BR", business);
  await addRequirement(page, projectId, "SR", stakeholder);
  await canvasWithAll(page, projectId, 2);
  await linkDown(page, business, stakeholder, 1);

  const edge = page.locator(".react-flow__edge").first();
  const line = edge.locator(".react-flow__edge-path");
  const field = (name: string) => page.getByTestId(`canvas-link-style-${name}`);
  await openLinkStyle(page, edge);
  await field("shape").selectOption("curved");
  await expect(line).toHaveAttribute("d", /C/);
  await field("pattern").selectOption("dashed");
  await field("start").selectOption("arrow");
  await field("end").selectOption("dot");
  await field("colour-2563EB").click();
  await expect(line).toHaveCSS("stroke", "rgb(37, 99, 235)");
  await field("weight").selectOption("4");
  await expect(line).toHaveCSS("stroke-width", "4px");

  await page.getByTestId("canvas-undo").click();
  await expect(line).not.toHaveCSS("stroke-width", "4px");
  await expect(line).toHaveCSS("stroke", "rgb(37, 99, 235)");
  await expect(field("weight")).toHaveValue("");
  await field("weight").selectOption("3");
  await expect(line).toHaveCSS("stroke-width", "3px");
  await page.waitForTimeout(800);

  await page.reload();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect(line).toHaveAttribute("d", /C/);
  await expect(line).toHaveCSS("stroke", "rgb(37, 99, 235)");
  await expect(line).toHaveCSS("stroke-width", "3px");
  expect(await line.evaluate((el) => getComputedStyle(el).strokeDasharray)).not.toBe("none");
  await expect(line).toHaveAttribute("marker-start", /url\(/);
  await expect(line).toHaveAttribute("marker-end", /url\(/);
  await openLinkStyle(page, edge);
  await expect(field("shape")).toHaveValue("curved");
  await expect(field("pattern")).toHaveValue("dashed");
  await expect(field("start")).toHaveValue("arrow");
  await expect(field("end")).toHaveValue("dot");
  await expect(field("weight")).toHaveValue("3");
  expect(errors).toEqual([]);
});

test("a styled link's end follows its card when the card moves, and after a reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const business = `E2E moving business ${stamp}`;
  const stakeholder = `E2E moving stakeholder ${stamp}`;
  await addRequirement(page, projectId, "BR", business);
  await addRequirement(page, projectId, "SR", stakeholder);
  await canvasWithAll(page, projectId, 2);
  await linkDown(page, business, stakeholder, 1);

  const edge = page.locator(".react-flow__edge").first();
  await openLinkStyle(page, edge);
  await page.getByTestId("canvas-link-style-shape").selectOption("straight");
  await page.getByTestId("canvas-link-style-close").click();
  await expect(page.getByTestId("canvas-link-style")).toBeHidden();

  const card = page.locator(".react-flow__node").filter({ hasText: stakeholder });
  const endsOnCard = async () => {
    const box = await cardBox(card);
    const { end } = await lineEnds(edge);
    return Math.abs(end.x - box.x) <= 16 && end.y >= box.y - 1 && end.y <= box.y + box.height + 1;
  };
  await expect.poll(endsOnCard).toBe(true);
  const before = (await lineEnds(edge)).end;

  await dragBy(page, card, 120, 140);
  await expect.poll(async () => (await lineEnds(edge)).end.y).toBeGreaterThan(before.y + 40);
  await expect.poll(endsOnCard).toBe(true);
  await page.waitForTimeout(800);

  await page.reload();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await expect.poll(endsOnCard).toBe(true);
  expect((await lineEnds(edge)).end.y).toBeGreaterThan(before.y + 40);
  expect(errors).toEqual([]);
});

test("a branch picked from a line's label starts on that line and stays there after a reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const business = `E2E branch business ${stamp}`;
  const first = `E2E branch first ${stamp}`;
  const second = `E2E branch second ${stamp}`;
  await addRequirement(page, projectId, "BR", business);
  await addRequirement(page, projectId, "SR", first);
  await addRequirement(page, projectId, "SR", second);
  await canvasWithAll(page, projectId, 3);
  await linkDown(page, business, first, 1);

  const nodes = page.locator(".react-flow__node");
  const edges = page.locator(".react-flow__edge");
  const secondId = await nodes.filter({ hasText: second }).getAttribute("data-id");
  const branchEdge = page.locator(`.react-flow__edge[data-id$=">${secondId}"]`);
  const parentLine = page.locator(
    `.react-flow__edge:not([data-id$=">${secondId}"]) .react-flow__edge-path`,
  );

  await edges.first().click({ button: "right", force: true });
  await page.getByTestId("canvas-menu-branch-label").click();
  await expect(page.getByTestId("canvas-picking")).toContainText(M.branching);
  await nodes.filter({ hasText: second }).click();
  await expect(page.getByTestId("canvas-picking")).toBeHidden();
  await expect(edges).toHaveCount(2, { timeout: 15_000 });
  await expect(branchEdge).toHaveCount(1);

  const startsOnParent = async () => {
    const { start } = await lineEnds(branchEdge);
    return parentLine.evaluate((el, spot) => {
      const path = el as SVGPathElement;
      const total = path.getTotalLength();
      const from = path.getPointAtLength(0);
      let nearest = Infinity;
      for (let step = 0; step <= 200; step += 1) {
        const point = path.getPointAtLength((total * step) / 200);
        nearest = Math.min(nearest, Math.hypot(point.x - spot.x, point.y - spot.y));
      }
      return { nearest, fromStart: Math.hypot(from.x - spot.x, from.y - spot.y) };
    }, start);
  };
  await expect.poll(async () => (await startsOnParent()).nearest).toBeLessThan(3);
  expect((await startsOnParent()).fromStart).toBeGreaterThan(20);
  await page.waitForTimeout(800);

  await page.reload();
  await expect(edges).toHaveCount(2);
  await expect.poll(async () => (await startsOnParent()).nearest).toBeLessThan(3);
  expect((await startsOnParent()).fromStart).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

/** Draws a link from the menu of `from` to `to`, then waits for the board to show `count` edges. */
async function linkDown(page: Page, from: string, to: string, count: number) {
  const nodes = page.locator(".react-flow__node");
  await nodes.filter({ hasText: from }).click({ button: "right" });
  await page.getByTestId("canvas-menu-link-downstream").click();
  await nodes.filter({ hasText: to }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(count, { timeout: 15_000 });
}

/**
 * Nothing lies over any part of the control, so each corner and its middle take the click. The
 * corners are sampled inside the rounding, which itself never takes a click.
 */
async function expectUncovered(control: Locator) {
  const covered = await control.evaluate((element) => {
    const { left, right, top, bottom } = element.getBoundingClientRect();
    const inset = Math.max(3, parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0);
    const points = [
      [left + inset, top + inset],
      [right - inset, top + inset],
      [(left + right) / 2, (top + bottom) / 2],
      [left + inset, bottom - inset],
      [right - inset, bottom - inset],
    ];
    return points.filter(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return !hit || !element.contains(hit);
    }).length;
  });
  expect(covered).toBe(0);
}

test("a focus hides every link off its trace, leaves Undo uncovered, and Escape or Show all brings every link back", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const first = `E2E trace first need ${stamp}`;
  const second = `E2E trace second need ${stamp}`;
  const stakeholder = `E2E trace stakeholder ${stamp}`;
  const functional = `E2E trace function ${stamp}`;
  await addRequirement(page, projectId, "BR", first);
  await addRequirement(page, projectId, "BR", second);
  await addRequirement(page, projectId, "SR", stakeholder);
  await addRequirement(page, projectId, "FR", functional);
  await canvasWithAll(page, projectId, 4);

  const nodes = page.locator(".react-flow__node");
  const edges = page.locator(".react-flow__edge");
  const undo = page.getByTestId("canvas-undo");
  const redo = page.getByTestId("canvas-redo");
  await linkDown(page, first, stakeholder, 1);
  await linkDown(page, stakeholder, functional, 2);
  await linkDown(page, second, stakeholder, 3);
  await linkDown(page, first, functional, 4);

  const focusFirst = async () => {
    await nodes.filter({ hasText: first }).click({ button: "right" });
    await page.getByTestId("canvas-menu-focus").click();
  };

  await focusFirst();
  await expect(nodes.filter({ hasText: second })).toBeHidden();
  await expect(nodes.filter({ hasText: stakeholder })).toBeVisible();
  await expect(nodes.filter({ hasText: functional })).toBeVisible();
  await expect(edges).toHaveCount(2);
  const status = await page.getByTestId("canvas-focus").boundingBox();
  expect(status?.width ?? 0).toBeLessThanOrEqual(1);

  await expect(undo).toBeVisible();
  await expect(undo).toBeEnabled();
  await expectUncovered(undo);
  await undo.click();
  await expect(edges).toHaveCount(1, { timeout: 15_000 });
  await expectUncovered(redo);
  await redo.click();
  await expect(edges).toHaveCount(2, { timeout: 15_000 });

  await page.getByTestId("canvas-focus-trace").click();
  await expect(page.getByTestId("canvas-focus-trace")).toBeHidden();
  await expect(nodes.filter({ hasText: second })).toBeHidden();
  await expect(edges).toHaveCount(3);
  await expectUncovered(undo);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("canvas-focus-clear")).toBeHidden();
  await expect(nodes.filter({ hasText: second })).toBeVisible();
  await expect(edges).toHaveCount(4);

  await focusFirst();
  await expect(edges).toHaveCount(2);
  await page.getByTestId("canvas-focus-clear").click();
  await expect(page.getByTestId("canvas-focus-clear")).toBeHidden();
  await expect(nodes).toHaveCount(4);
  await expect(edges).toHaveCount(4);
  expect(errors).toEqual([]);
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

test("Auto layout sets every card apart again after one was dropped on another", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const parent = `E2E layout parent ${stamp}`;
  await addWbsItem(page, projectId, `E2E layout phase ${stamp}`);
  await addRequirement(page, projectId, "FR", parent);
  await addSubRequirement(page, projectId, parent, `E2E layout child ${stamp}`);
  for (const n of [1, 2, 3]) {
    await addRequirement(page, projectId, "BR", `E2E layout need ${n} ${stamp}`);
  }
  await canvasWithAll(page, projectId, 6);

  const nodes = page.locator(".react-flow__node");
  const overlapping = () =>
    nodes.evaluateAll((all) => {
      const boxes = all.map((node) => node.getBoundingClientRect());
      return boxes.flatMap((a, index) =>
        boxes
          .slice(index + 1)
          .filter(
            (b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom,
          ),
      ).length;
    });
  await expect.poll(overlapping).toBe(0);

  const onScreen = await nodes.evaluateAll((all) => {
    const pane = document.querySelector(".react-flow")!.getBoundingClientRect();
    const top = Math.max(pane.top, 0);
    const bottom = Math.min(pane.bottom, window.innerHeight);
    return all
      .map((node) => node.getBoundingClientRect())
      .filter((box) => box.top >= top && box.bottom <= bottom && box.left >= pane.left)
      .filter((box) => box.right <= pane.right)
      .map((box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 }));
  });
  expect(onScreen.length).toBeGreaterThanOrEqual(2);
  const [from, onto] = onScreen.slice(-2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(onto.x + 10, onto.y + 10, { steps: 12 });
  await page.mouse.up();
  await expect.poll(overlapping).toBeGreaterThan(0);

  await page.getByRole("button", { name: M.autoLayout, exact: true }).click();
  await page.getByRole("button", { name: M.autoLayout, exact: true }).last().click();
  await expect.poll(overlapping).toBe(0);
  await page.waitForTimeout(800);
  expect(await overlapping()).toBe(0);

  await page.reload();
  await expect(nodes).toHaveCount(6);
  await expect.poll(overlapping).toBe(0);
  expect(errors).toEqual([]);
});

test("Undo takes back a move, a link and a removal from the canvas, and they stay undone", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const business = `E2E undo business ${stamp}`;
  const stakeholder = `E2E undo stakeholder ${stamp}`;
  await addRequirement(page, projectId, "BR", business);
  await addRequirement(page, projectId, "SR", stakeholder);
  await canvasWithAll(page, projectId, 2);

  const undo = page.getByTestId("canvas-undo");
  const nodes = page.locator(".react-flow__node");
  const edges = page.locator(".react-flow__edge");
  const node = nodes.filter({ hasText: business });
  const transform = () => node.evaluate((el) => (el as HTMLElement).style.transform);
  await page.reload();
  await expect(nodes).toHaveCount(2);
  await expect(undo).toBeDisabled();

  const actions = countActions(page);
  const laidOut = await transform();
  await node.click();
  await node.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(actions, { timeout: 5_000 }).toBe(1);
  await expect.poll(transform).not.toBe(laidOut);
  await page.keyboard.press("Control+z");
  await expect.poll(actions, { timeout: 5_000 }).toBe(2);
  await expect.poll(transform).toBe(laidOut);
  await expect(undo).toBeDisabled();

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(800);
  expect(actions()).toBe(2);
  expect(await transform()).toBe(laidOut);

  await node.click({ button: "right" });
  await page.getByTestId("canvas-menu-link-downstream").click();
  await nodes.filter({ hasText: stakeholder }).click();
  await expect(edges).toHaveCount(1, { timeout: 15_000 });
  await undo.click();
  await expect(edges).toHaveCount(0, { timeout: 15_000 });

  await node.click({ button: "right" });
  await page.getByTestId("canvas-menu-hide").click();
  await expect(nodes).toHaveCount(1);
  await undo.click();
  await expect(nodes).toHaveCount(2);
  await expect(undo).toBeDisabled();

  await page.reload();
  await expect(nodes).toHaveCount(2);
  await expect(edges).toHaveCount(0);
  expect(await transform()).toBe(laidOut);
  expect(errors).toEqual([]);
});

test("Redo makes an undone move and link again, and a new change leaves it nothing to redo", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const business = `E2E redo business ${stamp}`;
  const stakeholder = `E2E redo stakeholder ${stamp}`;
  await addRequirement(page, projectId, "BR", business);
  await addRequirement(page, projectId, "SR", stakeholder);
  await canvasWithAll(page, projectId, 2);

  const undo = page.getByTestId("canvas-undo");
  const redo = page.getByTestId("canvas-redo");
  const nodes = page.locator(".react-flow__node");
  const edges = page.locator(".react-flow__edge");
  const node = nodes.filter({ hasText: business });
  const transform = () => node.evaluate((el) => (el as HTMLElement).style.transform);
  await page.reload();
  await expect(nodes).toHaveCount(2);
  await expect(redo).toBeDisabled();

  const actions = countActions(page);
  const laidOut = await transform();
  await node.click();
  await node.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(actions, { timeout: 5_000 }).toBe(1);
  await expect.poll(transform).not.toBe(laidOut);
  const moved = await transform();
  await page.keyboard.press("Control+z");
  await expect.poll(actions, { timeout: 5_000 }).toBe(2);
  await expect.poll(transform).toBe(laidOut);
  await expect(redo).toBeEnabled();
  await page.keyboard.press("Control+y");
  await expect.poll(actions, { timeout: 5_000 }).toBe(3);
  await expect.poll(transform).toBe(moved);
  await expect(redo).toBeDisabled();
  await expect(undo).toBeEnabled();

  await node.click({ button: "right" });
  await page.getByTestId("canvas-menu-link-downstream").click();
  await nodes.filter({ hasText: stakeholder }).click();
  await expect(edges).toHaveCount(1, { timeout: 15_000 });
  await undo.click();
  await expect(edges).toHaveCount(0, { timeout: 15_000 });
  await node.focus();
  await page.keyboard.press("Control+Shift+Z");
  await expect(edges).toHaveCount(1, { timeout: 15_000 });
  await expect(redo).toBeDisabled();

  await undo.click();
  await expect(edges).toHaveCount(0, { timeout: 15_000 });
  await node.click();
  await node.focus();
  await expect(redo).toBeEnabled();
  const saved = actions();
  await page.keyboard.press("ArrowRight");
  await expect.poll(actions, { timeout: 5_000 }).toBe(saved + 1);
  await expect(redo).toBeDisabled();

  await page.reload();
  await expect(nodes).toHaveCount(2);
  await expect(edges).toHaveCount(0);
  expect(await transform()).not.toBe(moved);
  expect(errors).toEqual([]);
});

const wordingCell = (page: Page, text: string) =>
  page.getByRole("textbox", {
    name: messages.datasheet.cellLabel(R.requirement, text),
    exact: true,
  });

async function rename(page: Page, from: string, to: string) {
  const cell = wordingCell(page, from);
  await cell.click();
  await cell.fill(to);
  await cell.press("Enter");
  await expect(wordingCell(page, to)).toBeVisible({ timeout: 15_000 });
}

/** Clicking into a window gives it focus; a headless browser needs the event sent. */
async function bringForward(page: Page) {
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
}

test("a change saved in one window shows in the other once it comes to the front", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const first = `E2E window need ${stamp}`;
  const second = `E2E window need renamed ${stamp}`;
  const third = `E2E window need renamed again ${stamp}`;
  await addRequirement(page, projectId, "BR", first);
  await canvasWithAll(page, projectId, 1);

  const opened = page.context().waitForEvent("page");
  await page.getByTestId("open-in-new-window").click();
  const other = await opened;
  other.on("pageerror", (error) => errors.push(error.message));
  const card = other.locator(".react-flow__node");
  await expect(card.filter({ hasText: first })).toBeVisible({ timeout: 30_000 });

  const register = `/projects/${projectId}/requirements?view=list`;
  await page.goto(register);
  await rename(page, first, second);
  await bringForward(other);
  await expect(card.filter({ hasText: second })).toBeVisible({ timeout: 15_000 });

  await other.goto(register);
  await rename(other, second, third);
  await bringForward(page);
  await expect(wordingCell(page, third)).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("New requirement in the repository pane opens the form over the full-page board", async ({
  page,
}) => {
  const canvasPath = `/projects/${await createProject(page)}/deliverables/canvas`;
  await page.goto(canvasPath);
  await page.getByRole("button", { name: M.create, exact: true }).click();
  await createCanvas(page, canvasPath);

  const view = page.locator("[data-canvas-view]");
  await page.getByTestId("canvas-full-page").click();
  await expect(view).toHaveAttribute("data-canvas-view", "full");
  await page.getByTestId("canvas-new-requirement").click();
  await expect(page).toHaveURL(/id=new/);
  await expect(view).toHaveAttribute("data-canvas-view", "full");

  const form = page.getByTestId("requirement-form");
  const title = `E2E canvas new ${Date.now()}`;
  await form.getByLabel(R.requirement, { exact: true }).click();
  await page.keyboard.type(title);
  await page.getByTestId("requirement-save").click();
  await expect(form).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('[data-testid^="canvas-item-"]', { hasText: title })).toBeVisible({
    timeout: 15_000,
  });
});

test("the walkthrough lays placed requirements in lanes as they are placed and linked, by type or owner, and prints alone", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const business = `E2E walkthrough business ${stamp}`;
  const stakeholder = `E2E walkthrough stakeholder ${stamp}`;
  await addRequirement(page, projectId, "BR", business);
  await addRequirement(page, projectId, "SR", stakeholder);
  await canvasWithAll(page, projectId, 1);

  const walk = page.getByTestId("requirement-walkthrough");
  const lanes = walk.getByTestId("requirement-lane");
  const cards = walk.getByTestId("walkthrough-card");
  await page.getByTestId("canvas-walkthrough").click();
  await expect(walk).toHaveAttribute("data-lanes-by", "type");
  await expect(lanes).toHaveCount(1);
  await expect(cards).toHaveCount(1);

  await page
    .getByRole("button", { name: /^Add .+ to the canvas$/ })
    .first()
    .click();
  await expect(page.getByTestId("canvas-on-count")).toHaveText(M.onCanvasCount(2));
  await expect(lanes).toHaveCount(2);
  await expect(lanes.nth(0)).toHaveAttribute("data-lane", "type:BR");
  await expect(lanes.nth(1)).toHaveAttribute("data-lane", "type:SR");
  await expect(cards.filter({ hasText: stakeholder })).toHaveAttribute("data-step", "0");

  const nodes = page.locator(".react-flow__node");
  await nodes.filter({ hasText: business }).click({ button: "right" });
  await page.getByTestId("canvas-menu-link-downstream").click();
  await nodes.filter({ hasText: stakeholder }).click();
  await expect(page.locator(".react-flow__edge")).toHaveCount(1, { timeout: 15_000 });
  await expect(cards.filter({ hasText: business })).toHaveAttribute("data-step", "0");
  await expect(cards.filter({ hasText: stakeholder })).toHaveAttribute("data-step", "1");

  await walk.getByTestId("walkthrough-by-owner").click();
  await expect(walk).toHaveAttribute("data-lanes-by", "owner");
  await expect(walk.getByTestId("walkthrough-by-owner")).toHaveAttribute("aria-checked", "true");
  await expect(lanes.first()).toHaveAttribute("data-lane", /^owner:/);
  await expect(cards).toHaveCount(2);

  const scan = await new AxeBuilder({ page })
    .include('[data-testid="requirement-walkthrough"]')
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(scan.violations).toEqual([]);

  await page.emulateMedia({ media: "print" });
  await expect(page.locator("[data-canvas-panes]")).toBeHidden();
  await expect(page.getByTestId("walkthrough-print")).toBeHidden();
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toBeVisible();
  await page.emulateMedia({ media: "screen" });

  await walk.getByTestId("walkthrough-close").click();
  await expect(walk).toHaveCount(0);
  await expect(page.locator("[data-canvas-panes]")).toBeVisible();
  expect(errors).toEqual([]);
});

/** Finds a screen point inside the ReactFlow pane that hits neither a node nor a toolbar chrome element. */
async function emptyPaneSpot(page: Page): Promise<Spot> {
  return page.evaluate(() => {
    const pane = document.querySelector(".react-flow")!.getBoundingClientRect();
    const blockers = [...document.querySelectorAll(".react-flow__node, [data-canvas-chrome]")].map(
      (el) => el.getBoundingClientRect(),
    );
    const clear = (x: number, y: number) =>
      blockers.every((b) => x < b.left - 8 || x > b.right + 8 || y < b.top - 8 || y > b.bottom + 8);
    for (let y = pane.top + 80; y < pane.bottom - 24; y += 36) {
      for (let x = pane.left + 24; x < pane.right - 24; x += 48) {
        if (clear(x, y)) return { x, y };
      }
    }
    return { x: pane.left + 24, y: pane.bottom - 24 };
  });
}

test("right-clicking in focus mode offers Show all links without touching Undo", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const first = `E2E ctx focus first ${stamp}`;
  const second = `E2E ctx focus second ${stamp}`;
  const loose = `E2E ctx focus loose ${stamp}`;
  await addRequirement(page, projectId, "BR", first);
  await addRequirement(page, projectId, "SR", second);
  await addRequirement(page, projectId, "BR", loose);
  await canvasWithAll(page, projectId, 3);
  await linkDown(page, first, second, 1);

  await page.reload();
  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(3);
  const undo = page.getByTestId("canvas-undo");
  await expect(undo).toBeDisabled();

  const outsideSpot = await emptyPaneSpot(page);
  await page.mouse.click(outsideSpot.x, outsideSpot.y, { button: "right" });
  await expect(page.getByTestId("canvas-menu-show-all-links")).toHaveCount(0);

  await nodes.filter({ hasText: first }).click({ button: "right" });
  await page.getByTestId("canvas-menu-focus").click();
  await expect(page.getByTestId("canvas-focus")).toBeAttached();
  await expect(nodes.filter({ hasText: loose })).toBeHidden();
  await expect(undo).toBeDisabled();

  const paneSpot = await emptyPaneSpot(page);
  await page.mouse.click(paneSpot.x, paneSpot.y, { button: "right" });
  await page.getByTestId("canvas-menu-show-all-links").click();
  await expect(page.getByTestId("canvas-focus")).toHaveCount(0);
  await expect(nodes.filter({ hasText: loose })).toBeVisible();
  await expect(undo).toBeDisabled();

  await nodes.filter({ hasText: first }).click({ button: "right" });
  await page.getByTestId("canvas-menu-focus").click();
  await expect(nodes.filter({ hasText: loose })).toBeHidden();
  await nodes.filter({ hasText: first }).click({ button: "right" });
  await page.getByTestId("canvas-menu-show-all-links").click();
  await expect(page.getByTestId("canvas-focus")).toHaveCount(0);
  await expect(nodes.filter({ hasText: loose })).toBeVisible();
  expect(errors).toEqual([]);
});

test("placing an unlinked requirement during focus keeps it visible and survives reload", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const first = `E2E pin focus first ${stamp}`;
  const second = `E2E pin focus second ${stamp}`;
  const unlinked = `E2E pin focus unlinked ${stamp}`;
  await addRequirement(page, projectId, "BR", first);
  await addRequirement(page, projectId, "SR", second);
  await addRequirement(page, projectId, "BR", unlinked);

  const canvasPath = `/projects/${projectId}/deliverables/canvas`;
  await page.goto(canvasPath);
  await createCanvas(page, canvasPath);
  for (let placed = 1; placed <= 2; placed += 1) {
    await page
      .getByRole("button", { name: /^Add .+ to the canvas$/ })
      .first()
      .click();
    await expect(page.getByTestId("canvas-on-count")).toHaveText(M.onCanvasCount(placed));
  }
  await linkDown(page, first, second, 1);

  const nodes = page.locator(".react-flow__node");
  await nodes.filter({ hasText: first }).click({ button: "right" });
  await page.getByTestId("canvas-menu-focus").click();
  await expect(page.getByTestId("canvas-focus")).toBeAttached();

  const actions = countActions(page);
  await page
    .getByRole("button", { name: /^Add .+ to the canvas$/ })
    .first()
    .click();
  await expect(page.getByTestId("canvas-on-count")).toHaveText(M.onCanvasCount(3));
  await expect(nodes.filter({ hasText: unlinked })).toBeVisible();
  await expect(page.getByTestId("canvas-focus")).toBeAttached();
  await expect.poll(actions, { timeout: 5_000 }).toBe(1);

  await page.reload();
  await expect(nodes).toHaveCount(3);
  await expect(nodes.filter({ hasText: unlinked })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Separate overlaps nudges only overlapping cards apart, preserves untouched cards, and undoes in one step", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const stamp = Date.now();
  const one = `E2E sep one ${stamp}`;
  const two = `E2E sep two ${stamp}`;
  const three = `E2E sep three ${stamp}`;
  await addRequirement(page, projectId, "BR", one);
  await addRequirement(page, projectId, "BR", two);
  await addRequirement(page, projectId, "BR", three);
  await canvasWithAll(page, projectId, 3);

  await page.reload();
  const nodes = page.locator(".react-flow__node");
  await expect(nodes).toHaveCount(3);
  const overlapping = () =>
    nodes.evaluateAll((all) => {
      const boxes = all.map((node) => node.getBoundingClientRect());
      return boxes.flatMap((a, index) =>
        boxes
          .slice(index + 1)
          .filter(
            (b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom,
          ),
      ).length;
    });

  const separate = page.getByTestId("canvas-separate-overlaps");
  const undo = page.getByTestId("canvas-undo");
  await expect(separate).toBeDisabled();

  const actions = countActions(page);
  const nodeThree = nodes.filter({ hasText: three });
  await dragBy(page, nodeThree, 360, 0);
  await expect.poll(actions, { timeout: 5_000 }).toBe(1);
  const threeBefore = await cardBox(nodeThree);

  const nodeOne = nodes.filter({ hasText: one });
  const nodeTwo = nodes.filter({ hasText: two });
  const boxOne = (await nodeOne.boundingBox())!;
  const boxTwo = (await nodeTwo.boundingBox())!;
  await page.mouse.move(boxOne.x + boxOne.width / 2, boxOne.y + 12);
  await page.mouse.down();
  await page.mouse.move(boxTwo.x + boxTwo.width / 2 + 12, boxTwo.y + 12, { steps: 12 });
  await page.mouse.up();
  await expect.poll(actions, { timeout: 5_000 }).toBe(2);
  await expect.poll(overlapping).toBeGreaterThan(0);
  await expect(separate).toBeEnabled();

  await separate.click();
  await expect.poll(actions, { timeout: 5_000 }).toBe(3);
  await expect.poll(overlapping).toBe(0);
  expect(await cardBox(nodeThree)).toEqual(threeBefore);
  await expect(separate).toBeDisabled();
  await expect(undo).toBeEnabled();

  await undo.click();
  await expect.poll(actions, { timeout: 5_000 }).toBe(4);
  await expect.poll(overlapping).toBeGreaterThan(0);
  await page.getByTestId("canvas-redo").click();
  await expect.poll(actions, { timeout: 5_000 }).toBe(5);
  await expect.poll(overlapping).toBe(0);
  expect(await cardBox(nodeThree)).toEqual(threeBefore);

  await page.reload();
  await expect(nodes).toHaveCount(3);
  await expect.poll(overlapping).toBe(0);
  expect(await cardBox(nodeThree)).toEqual(threeBefore);
  expect(errors).toEqual([]);
});

/** Project 2 is the seeded project where e2e-pm is a Manager and e2e-viewer a Viewer. */
test("a Viewer sees the canvas without Separate overlaps", async ({ page, browser }) => {
  await addRequirement(page, "2", "BR", `E2E viewer canvas ${Date.now()}`);
  await canvasWithAll(page, "2", 1);
  await expect(page.getByTestId("canvas-separate-overlaps")).toBeVisible();
  const { pathname, search } = new URL(page.url());

  const viewer = await browser.newContext({ storageState: "e2e/.auth/viewer.json" });
  const viewerPage = await viewer.newPage();
  await viewerPage.goto(`${pathname}${search}`);
  await expect(viewerPage.getByTestId("canvas-board")).toBeVisible();
  await expect(viewerPage.locator(".react-flow__node")).toHaveCount(1);
  await expect(viewerPage.getByTestId("canvas-separate-overlaps")).toHaveCount(0);
  await viewer.close();
});

test("Back to content appears when cards are panned offscreen and fits them back", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const projectId = await createProject(page);
  const title = `E2E back content ${Date.now()}`;
  await addRequirement(page, projectId, "BR", title);
  await canvasWithAll(page, projectId, 1);

  const node = page.locator(".react-flow__node").filter({ hasText: title });
  await expect(node).toBeVisible();
  const backButton = page.getByTestId("canvas-back-to-content");
  await expect(backButton).toHaveCount(0);

  for (let pan = 0; pan < 2; pan += 1) {
    const spot = await emptyPaneSpot(page);
    await page.mouse.move(spot.x, spot.y);
    await page.mouse.down();
    await page.mouse.move(spot.x + 800, spot.y + 500, { steps: 10 });
    await page.mouse.up();
  }
  await expect(backButton).toBeVisible();

  await backButton.click();
  await expect(backButton).toHaveCount(0);
  await expect(node).toBeVisible();
  expect(errors).toEqual([]);
});
