import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Shared rich-text editor + sanitiser (ADR-0025) on the kitchen sink. The
 * demo form submits with GET, so the page parses the value with the shared
 * richTextSchema on the server and renders it through RichTextView.
 */
async function openEditor(page: Page, url = "/kitchen-sink") {
  await page.goto(url);
  // The Tiptap surface is a lazy chunk: wait for it, not just the page.
  const editor = page.getByRole("textbox", { name: "Description", exact: true });
  await expect(editor).toBeVisible();
  return editor;
}

async function clear(page: Page) {
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
}

test.describe("rich-text editor (ADR-0025)", () => {
  test("formats, inserts a table, submits and renders the server-sanitised result", async ({
    page,
  }) => {
    const editor = await openEditor(page);
    const form = page.getByTestId("ks-rich-text-form");
    await editor.click();
    await clear(page);
    await page.keyboard.type("Plain ");
    await page.keyboard.press("Control+B");
    await page.keyboard.type("bold");
    await page.keyboard.press("Control+B");
    await page.keyboard.type(" and ");
    await page.keyboard.press("Control+Shift+X");
    await page.keyboard.type("struck");
    await page.keyboard.press("Control+Shift+X");
    // Edits reach the fieldset's onChange through the bridge input (unsaved guard).
    await expect(form).toHaveAttribute("data-dirty", "true");

    const toolbar = page.getByRole("toolbar", { name: "Formatting" });
    await toolbar.getByRole("button", { name: "Table" }).click();
    await page.getByRole("menuitem", { name: "Insert table" }).click();
    await page.keyboard.type("Cell one");

    await form.getByRole("button", { name: "Preview" }).click();
    await expect(page).toHaveURL(/richText=/);
    const view = page.getByTestId("ks-rich-text-view");
    await expect(view.locator("strong")).toHaveText("bold");
    await expect(view.locator("s")).toHaveText("struck");
    await expect(view.locator("table th").first()).toHaveText("Cell one");
    // The editor starts from the saved document.
    await expect(
      page.getByRole("textbox", { name: "Description", exact: true }).locator("table"),
    ).toBeVisible();
  });

  test("adds a link with Ctrl+K and refuses unsafe addresses", async ({ page }) => {
    const editor = await openEditor(page);
    await editor.click();
    await clear(page);
    await page.keyboard.press("Control+K");
    const dialog = page.getByRole("dialog", { name: "Link" });
    const address = dialog.getByLabel("Web or e-mail address");
    await address.fill("javascript:alert(1)");
    await address.press("Enter");
    await expect(dialog.getByText("Enter a web or e-mail address")).toBeVisible();
    await address.fill("example.com/docs");
    await address.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(editor.locator('a[href="https://example.com/docs"]')).toHaveText(
      "https://example.com/docs",
    );
  });

  test("validates on blur and on submit", async ({ page }) => {
    const editor = await openEditor(page);
    const form = page.getByTestId("ks-rich-text-form");
    await editor.click();
    await clear(page);
    await page.keyboard.press("Tab");
    await expect(form.getByText("Enter some text")).toBeVisible();
    await expect(editor).toHaveAttribute("aria-invalid", "true");
    await form.getByRole("button", { name: "Preview" }).click();
    await expect(form.getByRole("alert")).toBeVisible();
    await expect(page).not.toHaveURL(/richText=/);
  });

  test("the server sanitises submitted HTML before rendering it", async ({ page }) => {
    let dialogs = 0;
    page.on("dialog", (d) => {
      dialogs += 1;
      void d.dismiss();
    });
    const hostile =
      '<p>safe <a href="javascript:alert(1)">bad link</a></p>' +
      "<img src=x onerror=alert(1)><script>alert(1)</script><iframe src=javascript:alert(1)></iframe>";
    await openEditor(page, `/kitchen-sink?richText=${encodeURIComponent(hostile)}`);
    const view = page.getByTestId("ks-rich-text-view");
    await expect(view).toHaveText("safe bad link");
    await expect(view.locator("img, script, iframe, a")).toHaveCount(0);
    expect(dialogs).toBe(0);
  });

  test("renders seeded Access markup converted", async ({ page }) => {
    await page.goto("/kitchen-sink");
    const legacy = page.getByTestId("ks-rich-text-legacy");
    await expect(legacy.locator("p")).toHaveText("This field support rich text editing");
    await expect(legacy.locator("span em")).toHaveText("editing");
    await expect(legacy.locator("div, font")).toHaveCount(0);
  });

  test("a disabled fieldset makes the editor read-only", async ({ page }) => {
    await openEditor(page);
    const wrapper = page.getByTestId("ks-rich-text-readonly");
    const surface = page.getByRole("textbox", { name: "Archived copy" });
    await expect(surface).toHaveAttribute("contenteditable", "false");
    await expect(surface).toHaveAttribute("aria-readonly", "true");
    await expect(wrapper.getByRole("toolbar")).toHaveCount(0);
  });

  test("the toolbar is one tab stop with arrow-key movement", async ({ page }) => {
    const editor = await openEditor(page);
    const toolbar = page.getByRole("toolbar", { name: "Formatting" });
    await editor.click();
    // Into the heading: in a list item, Shift+Tab outdents instead of leaving.
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Shift+Tab");
    await expect(toolbar.getByRole("button", { name: "Undo" })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(toolbar.getByRole("button", { name: "Redo" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(toolbar.getByRole("button", { name: "Clear formatting" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(toolbar.getByRole("button", { name: "Undo" })).toBeFocused();
    // Leaving and re-entering lands on the last active control.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(toolbar.getByRole("button", { name: "Redo" })).toBeFocused();
  });

  test("loads and edits without requests to another host (offline desktop)", async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL ?? "http://localhost:3000").origin;
    const foreign: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (/^https?:$/.test(url.protocol) && url.origin !== origin) foreign.push(request.url());
    });
    const editor = await openEditor(page);
    await editor.click();
    await page.keyboard.type("offline");
    await page
      .getByRole("toolbar", { name: "Formatting" })
      .getByRole("button", { name: "Bold" })
      .click();
    expect(foreign).toEqual([]);
  });

  test("axe: no serious or critical violations with the editor loaded (light and dark)", async ({
    page,
  }) => {
    await openEditor(page);
    const serious = async () =>
      (
        await new AxeBuilder({ page }).include('[aria-labelledby="ks-rich-text"]').analyze()
      ).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(await serious()).toEqual([]);

    await page.emulateMedia({ colorScheme: "dark" });
    await openEditor(page);
    expect(await serious()).toEqual([]);
  });
});
