import { expect, test, type Locator, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";

const M = messages.bpmn;

async function createProject(page: Page): Promise<string> {
  await page.goto("/projects/new");
  await page.getByLabel(messages.projects.name).fill(`E2E bpmn project ${Date.now()}`);
  await page.getByTestId("project-save").click();
  await page.waitForURL(/\/projects\/\d+/);
  return new URL(page.url()).pathname.split("/")[2]!;
}

async function createDiagram(page: Page, projectId: string): Promise<void> {
  await page.goto(`/projects/${projectId}/bpmn`);
  await expect(page.getByText(M.none)).toBeVisible();
  await page.getByLabel(M.nameLabel).fill(`E2E diagram ${Date.now()}`);
  await page.getByRole("button", { name: M.create, exact: true }).click();
  await expect(page).toHaveURL(/\/bpmn\?diagram=\d+$/, { timeout: 30_000 });
  await expect(page.getByTestId("bpmn-board")).toBeVisible();
}

async function box(locator: Locator) {
  const found = await locator.boundingBox();
  if (!found) throw new Error("element has no box");
  return found;
}

/** Drags a palette symbol onto the board at a point inside `inside`, `dx` from its left edge. */
async function dropInto(page: Page, item: string, inside: Locator, dx: number) {
  const board = page.getByTestId("bpmn-board");
  const [lane, frame] = [await box(inside), await box(board)];
  await page.getByTestId(`bpmn-palette-${item}`).dragTo(board, {
    targetPosition: { x: lane.x - frame.x + dx, y: lane.y - frame.y + lane.height / 2 },
    force: true,
  });
}

async function writeOn(page: Page, target: Locator, text: string) {
  await target.dblclick();
  const input = page.getByTestId("bpmn-text-input");
  await expect(input).toBeVisible();
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toBeHidden();
}

const centre = (b: { x: number; y: number; width: number; height: number }) => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});
const within = (
  point: { x: number; y: number },
  b: { x: number; y: number; width: number; height: number },
) => point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height;

async function waitForSave(page: Page) {
  await expect(page.getByTestId("bpmn-save-status")).toHaveAttribute("data-status", "saved", {
    timeout: 30_000,
  });
}

test.describe("BPMN diagrams", () => {
  test("shapes in two lanes, connected and labelled, survive a reload", async ({ page }) => {
    test.setTimeout(180_000);
    const projectId = await createProject(page);
    await createDiagram(page, projectId);

    await page.getByTestId("bpmn-palette-pool").click();
    const lanes = page.getByTestId("bpmn-lane");
    await expect(lanes).toHaveCount(2);
    await writeOn(page, page.getByTestId("bpmn-lane-header").first(), "Sales");
    await writeOn(page, page.getByTestId("bpmn-lane-header").nth(1), "Warehouse");
    await expect(lanes.first()).toHaveAttribute("data-name", "Sales");

    await dropInto(page, "task", lanes.first(), 160);
    await dropInto(page, "userTask", lanes.nth(1), 420);
    const shapes = page.getByTestId("bpmn-shape");
    await expect(shapes).toHaveCount(2);
    const task = page.locator('[data-testid="bpmn-shape"][data-kind="task"]');
    const userTask = page.locator('[data-testid="bpmn-shape"][data-kind="userTask"]');
    await writeOn(page, task, "Take order");
    await writeOn(page, userTask, "Pick items");
    await expect(task).toHaveAttribute("data-label", "Take order");

    await task.hover();
    const from = centre(await box(task.locator(".react-flow__handle-right")));
    const to = centre(await box(userTask.locator(".react-flow__handle-left")));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    const edge = page.locator(".react-flow__edge");
    await expect(edge).toHaveCount(1);

    await edge.locator(".react-flow__edge-interaction").dblclick({ force: true });
    const input = page.getByTestId("bpmn-text-input");
    await expect(input).toBeVisible();
    await input.fill("In stock");
    await input.press("Enter");
    await expect(page.getByTestId("bpmn-flow-label")).toHaveText("In stock");

    await waitForSave(page);
    await page.reload();

    await expect(page.getByTestId("bpmn-lane")).toHaveCount(2, { timeout: 30_000 });
    await expect(page.getByTestId("bpmn-lane").first()).toHaveAttribute("data-name", "Sales");
    await expect(page.getByTestId("bpmn-lane").nth(1)).toHaveAttribute("data-name", "Warehouse");
    await expect(task).toHaveAttribute("data-label", "Take order");
    await expect(userTask).toHaveAttribute("data-label", "Pick items");
    await expect(page.locator(".react-flow__edge")).toHaveCount(1);
    await expect(page.getByTestId("bpmn-flow-label")).toHaveText("In stock");
    expect(within(centre(await box(task)), await box(page.getByTestId("bpmn-lane").first()))).toBe(
      true,
    );
    expect(
      within(centre(await box(userTask)), await box(page.getByTestId("bpmn-lane").nth(1))),
    ).toBe(true);
  });

  test("undo takes a shape back, redo puts it back, and the XML export names the pool", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const projectId = await createProject(page);
    await createDiagram(page, projectId);

    await page.getByTestId("bpmn-palette-pool").click();
    await page.getByTestId("bpmn-palette-exclusiveGateway").click();
    const shapes = page.getByTestId("bpmn-shape");
    await expect(shapes).toHaveCount(1);
    await page.getByTestId("bpmn-undo").click();
    await expect(shapes).toHaveCount(0);
    await page.getByTestId("bpmn-redo").click();
    await expect(shapes).toHaveCount(1);
    await waitForSave(page);

    const download = page.waitForEvent("download");
    await page.getByTestId("bpmn-export-xml").click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.bpmn$/);
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const xml = Buffer.concat(chunks).toString("utf8");
    expect(xml).toContain(`<bpmn:participant`);
    expect(xml).toContain(`name="${M.newPoolName}"`);
    expect(xml).toContain("<bpmn:exclusiveGateway");
  });
});
