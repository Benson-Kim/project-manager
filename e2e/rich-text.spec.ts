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

/** Picks one choice from a toolbar menu; the menu puts focus back in the text. */
async function pickFrom(page: Page, menu: string, item: string) {
  await page
    .getByRole("toolbar", { name: "Formatting" })
    .getByRole("button", { name: menu, exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: item, exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Description", exact: true })).toBeFocused();
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
    // Tiptap's focus command moves the real focus on the next animation frame, so keys sent
    // at once land on the page: wait for the table and for the editor to hold focus.
    await expect(editor.locator("table")).toBeVisible();
    await expect(editor).toBeFocused();
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

  test("colours, highlights, indents, numbering, h5, shading and page breaks survive the server (ADR-0041)", async ({
    page,
  }) => {
    const editor = await openEditor(page);
    const toolbar = page.getByRole("toolbar", { name: "Formatting" });
    const pick = async (menu: string, item: string) => {
      await toolbar.getByRole("button", { name: menu, exact: true }).click();
      await page.getByRole("menuitemradio", { name: item, exact: true }).click();
      await expect(editor).toBeFocused();
    };
    await editor.click();
    await clear(page);
    for (const line of ["Red words", "Marked words", "Indented", "Heading five"]) {
      await page.keyboard.type(line);
      await page.keyboard.press("Enter");
    }
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("Shift+End");
    await pick("Text colour", "Red");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+End");
    await pick("Highlight", "Green");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Control+M");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Control+Alt+5");
    await page.keyboard.press("Control+End");

    await pick("Numbering style", "a, b, c");
    await page.keyboard.type("alpha");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await toolbar.getByRole("button", { name: "Insert", exact: true }).click();
    await page.getByRole("menuitem", { name: "Page break" }).click();
    await expect(editor.locator("hr[data-page-break]")).toHaveCount(1);
    await expect(editor).toBeFocused();
    await toolbar.getByRole("button", { name: "Table", exact: true }).click();
    await page.getByRole("menuitem", { name: "Insert table" }).click();
    await expect(editor.locator("table")).toBeVisible();
    await expect(editor).toBeFocused();
    await page.keyboard.type("Shaded");
    await pick("Cell shading", "Blue");

    await page.getByTestId("ks-rich-text-form").getByRole("button", { name: "Preview" }).click();
    await expect(page).toHaveURL(/richText=/);
    const view = page.getByTestId("ks-rich-text-view");
    const red = view.locator('span[data-color="red"]');
    await expect(red).toHaveText("Red words");
    await expect(view.locator('mark[data-color="green"]')).toHaveText("Marked words");
    await expect(view.locator('p[data-indent="1"]')).toHaveText("Indented");
    await expect(view.locator("h5")).toHaveText("Heading five");
    await expect(view.locator('ol[type="a"] li')).toHaveText("alpha");
    await expect(view.locator("hr[data-page-break]")).toHaveCount(1);
    await expect(view.locator('[data-shade="blue"]')).toHaveText("Shaded");

    const style = (selector: string, property: string) =>
      view
        .locator(selector)
        .first()
        .evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);
    expect(await style('ol[type="a"]', "list-style-type")).toBe("lower-alpha");
    expect(parseFloat(await style('p[data-indent="1"]', "margin-left"))).toBeGreaterThan(0);
    expect(await style('mark[data-color="green"]', "background-color")).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    const lightRed = await style('span[data-color="red"]', "color");
    expect(lightRed).not.toBe(await style("p", "color"));

    // Dark mode paints the same names with the dark tokens, and they still pass contrast.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(red).toHaveText("Red words");
    expect(await style('span[data-color="red"]', "color")).not.toBe(lightRed);
    const violations = (
      await new AxeBuilder({ page }).include('[data-testid="ks-rich-text-view"]').analyze()
    ).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(violations).toEqual([]);
  });

  test("a highlight over a text colour keeps readable ink in light and dark (axe)", async ({
    page,
  }) => {
    const editor = await openEditor(page);
    await editor.click();
    await clear(page);
    await page.keyboard.type("Both formats");
    await page.keyboard.press("Shift+Home");
    await pickFrom(page, "Text colour", "Yellow");
    await pickFrom(page, "Highlight", "Blue");
    await page.getByTestId("ks-rich-text-form").getByRole("button", { name: "Preview" }).click();
    await expect(page).toHaveURL(/richText=/);
    const view = page.getByTestId("ks-rich-text-view");
    await expect(view.locator('mark[data-color="blue"]')).toHaveText("Both formats");
    await expect(view.locator('span[data-color="yellow"]')).toHaveText("Both formats");

    const inkOnHighlight = () =>
      view
        .locator("mark")
        .evaluate((mark) => getComputedStyle(mark.querySelector("[data-color]") ?? mark).color);
    const pageInk = () =>
      view
        .locator("p")
        .first()
        .evaluate((p) => getComputedStyle(p).color);
    const serious = async () =>
      (
        await new AxeBuilder({ page }).include('[data-testid="ks-rich-text-view"]').analyze()
      ).violations.filter((v) => v.impact === "serious" || v.impact === "critical");

    expect(await inkOnHighlight()).toBe(await pageInk());
    expect(await serious()).toEqual([]);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(view.locator("mark")).toHaveText("Both formats");
    expect(await inkOnHighlight()).toBe(await pageInk());
    expect(await serious()).toEqual([]);
  });

  test("numbering style and start change only the innermost list", async ({ page }) => {
    const editor = await openEditor(page);
    const toolbar = page.getByRole("toolbar", { name: "Formatting" });
    await editor.click();
    await clear(page);
    await toolbar.getByRole("button", { name: "Numbered list", exact: true }).click();
    await expect(editor).toBeFocused();
    await page.keyboard.type("outer");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Control+M");
    await page.keyboard.type("inner");
    await expect(editor.locator("ol ol li")).toHaveText("inner");

    await pickFrom(page, "Numbering style", "A, B, C");
    await toolbar.getByRole("button", { name: "Numbering style", exact: true }).click();
    await page.getByRole("menuitem", { name: "Start numbering at" }).click();
    const dialog = page.getByRole("dialog", { name: "Start numbering at" });
    await dialog.getByRole("spinbutton", { name: "First number" }).fill("3");
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog).toBeHidden();

    const inner = editor.locator("ol ol");
    const outer = editor.locator("ol").first();
    await expect(inner).toHaveAttribute("type", "A");
    await expect(inner).toHaveAttribute("start", "3");
    await expect(outer).not.toHaveAttribute("type");
    await expect(outer).not.toHaveAttribute("start");
  });

  test("Start numbering at returns focus to the numbering menu (keyboard only)", async ({
    page,
  }) => {
    const editor = await openEditor(page);
    const numbering = page
      .getByRole("toolbar", { name: "Formatting" })
      .getByRole("button", { name: "Numbering style", exact: true });
    const dialog = page.getByRole("dialog", { name: "Start numbering at" });
    const openStartDialog = async () => {
      await numbering.focus();
      await page.keyboard.press("Enter");
      const startAt = page.getByRole("menuitem", { name: "Start numbering at" });
      while (!(await startAt.evaluate((el) => el === document.activeElement))) {
        await page.keyboard.press("ArrowDown");
      }
      await page.keyboard.press("Enter");
      await expect(dialog).toBeVisible();
    };
    await editor.click();
    await clear(page);
    await page.keyboard.type("item");

    await openStartDialog();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(numbering).toBeFocused();

    await openStartDialog();
    const first = dialog.getByRole("spinbutton", { name: "First number" });
    await first.fill("5");
    await first.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(numbering).toBeFocused();
    await expect(editor.locator("ol")).toHaveAttribute("start", "5");
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

  test("validates on blur after moving through the toolbar and the link dialog", async ({
    page,
  }) => {
    const editor = await openEditor(page);
    const form = page.getByTestId("ks-rich-text-form");
    const toolbar = page.getByRole("toolbar", { name: "Formatting" });
    await editor.click();
    await clear(page);
    await page.keyboard.press("Control+K");
    const dialog = page.getByRole("dialog", { name: "Link" });
    await expect(dialog).toBeVisible();
    await expect(form.getByText("Enter some text")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(editor).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(toolbar.locator(":focus")).toHaveCount(1);
    await expect(form.getByText("Enter some text")).toHaveCount(0);
    await page.keyboard.press("Shift+Tab");
    await expect(toolbar.locator(":focus")).toHaveCount(0);
    await expect(form.getByText("Enter some text")).toBeVisible();
    await expect(editor).toHaveAttribute("aria-invalid", "true");
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
    // The editor takes a caret move from the browser's selectionchange, a task later. Under
    // load, Shift+Tab arrived first and outdented the clicked list item; wait for the heading.
    await expect(toolbar.getByRole("combobox", { name: "Text style" })).toHaveValue("2");
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
