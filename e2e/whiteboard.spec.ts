import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";

const M = messages.whiteboard;

async function createProject(page: Page): Promise<string> {
  await page.goto("/projects/new");
  await page.getByLabel(messages.projects.name).fill(`E2E whiteboard project ${Date.now()}`);
  await page.getByTestId("project-save").click();
  await page.waitForURL(/\/projects\/\d+/);
  return new URL(page.url()).pathname.split("/")[2]!;
}

async function canvasBox(page: Page) {
  const found = await page.getByTestId("whiteboard-canvas").boundingBox();
  if (!found) throw new Error("whiteboard canvas has no box");
  return found;
}

/** The drawing is on a canvas, so a shape shows only through the actions offered once it is selected. */
const deleteShape = (page: Page) =>
  page.locator(".excalidraw").getByRole("button", { name: "Delete", exact: true });

async function openNewBoard(page: Page) {
  const projectId = await createProject(page);
  await page.goto(`/projects/${projectId}/whiteboard`);
  await expect(page.getByText(M.none)).toBeVisible();
  await page.getByTestId("whiteboard-name").fill(`E2E whiteboard ${Date.now()}`);
  await page.getByTestId("whiteboard-save").click();
  await expect(page).toHaveURL(/\/whiteboard\?board=\d+$/, { timeout: 30_000 });
  await expect(page.getByTestId("toolbar-rectangle")).toBeVisible({ timeout: 30_000 });
}

async function drawRectangle(page: Page) {
  await page.getByTestId("toolbar-rectangle").locator("xpath=..").click();
  const frame = await canvasBox(page);
  const start = { x: frame.x + frame.width / 3, y: frame.y + frame.height / 3 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 160, start.y + 100, { steps: 8 });
  await page.mouse.up();
}

test.describe("Whiteboard", () => {
  test("a drawn shape saves and is still there after a reload", async ({ page }) => {
    test.setTimeout(180_000);
    await openNewBoard(page);

    const status = page.getByTestId("whiteboard-save-status");
    await expect(status).toHaveAttribute("data-status", "saved");

    await drawRectangle(page);

    await expect(status).not.toHaveAttribute("data-status", "saved");
    await expect(status).toHaveAttribute("data-status", "saved", { timeout: 30_000 });

    await page.reload();
    await expect(page.getByTestId("toolbar-rectangle")).toBeVisible({ timeout: 30_000 });
    await expect(deleteShape(page)).toBeHidden();
    const after = await canvasBox(page);
    await page.mouse.click(after.x + 10, after.y + after.height - 30);
    await page.keyboard.press("ControlOrMeta+a");
    await expect(deleteShape(page)).toBeVisible();
    await expect(status).toHaveAttribute("data-status", "saved");
  });

  test("the board scrolls sideways, finds its drawing, saves, prints and goes full screen", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      window.print = () => document.body.setAttribute("data-printed", "yes");
    });
    await openNewBoard(page);
    await drawRectangle(page);

    const scrollbar = page.getByRole("scrollbar", { name: M.scrollSideways });
    await scrollbar.focus();
    await page.keyboard.press("End");
    await expect(scrollbar).toHaveAttribute("aria-valuenow", "100");
    await page.keyboard.press("Home");
    await expect(scrollbar).toHaveAttribute("aria-valuenow", "0");
    await page.keyboard.press("ArrowRight");
    await expect(scrollbar).not.toHaveAttribute("aria-valuenow", "0");

    await page.keyboard.press("End");
    await page.getByTestId("whiteboard-back-to-content").click();
    await expect
      .poll(async () => Number(await scrollbar.getAttribute("aria-valuenow")))
      .toBeLessThan(100);

    const status = page.getByTestId("whiteboard-save-status");
    await page.getByTestId("whiteboard-save-now").click();
    await expect(status).toHaveAttribute("data-status", "saved", { timeout: 30_000 });

    await page.getByTestId("whiteboard-print").click();
    await expect(page.locator("body")).toHaveAttribute("data-printed", "yes");
    await expect(page.getByTestId("whiteboard-print-image")).toBeAttached();

    const fullscreen = page.getByTestId("whiteboard-fullscreen");
    await fullscreen.click();
    await expect(fullscreen).toHaveAttribute("aria-pressed", "true");
    await fullscreen.click();
    await expect(fullscreen).toHaveAttribute("aria-pressed", "false");
  });
});
