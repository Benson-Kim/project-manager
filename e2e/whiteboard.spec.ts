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

test.describe("Whiteboard", () => {
  test("a drawn shape saves and is still there after a reload", async ({ page }) => {
    test.setTimeout(180_000);
    const projectId = await createProject(page);

    await page.goto(`/projects/${projectId}/whiteboard`);
    await expect(page.getByText(M.none)).toBeVisible();
    await page.getByTestId("whiteboard-name").fill(`E2E whiteboard ${Date.now()}`);
    await page.getByTestId("whiteboard-save").click();
    await expect(page).toHaveURL(/\/whiteboard\?board=\d+$/, { timeout: 30_000 });
    await expect(page.getByTestId("toolbar-rectangle")).toBeVisible({ timeout: 30_000 });

    const status = page.getByTestId("whiteboard-save-status");
    await expect(status).toHaveAttribute("data-status", "saved");

    await page.getByTestId("toolbar-rectangle").locator("xpath=..").click();
    const frame = await canvasBox(page);
    const start = { x: frame.x + frame.width / 3, y: frame.y + frame.height / 3 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 160, start.y + 100, { steps: 8 });
    await page.mouse.up();

    await expect(status).not.toHaveAttribute("data-status", "saved");
    await expect(status).toHaveAttribute("data-status", "saved", { timeout: 30_000 });

    await page.reload();
    await expect(page.getByTestId("toolbar-rectangle")).toBeVisible({ timeout: 30_000 });
    await expect(deleteShape(page)).toBeHidden();
    const after = await canvasBox(page);
    await page.mouse.click(after.x + 10, after.y + after.height - 10);
    await page.keyboard.press("ControlOrMeta+a");
    await expect(deleteShape(page)).toBeVisible();
    await expect(status).toHaveAttribute("data-status", "saved");
  });
});
