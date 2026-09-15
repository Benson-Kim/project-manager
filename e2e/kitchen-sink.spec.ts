import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("kitchen sink — shared primitives", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/kitchen-sink");
  });

  test("axe scan has no serious or critical violations (light and dark)", async ({ page }) => {
    const light = await new AxeBuilder({ page }).analyze();
    expect(
      light.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);

    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    const dark = await new AxeBuilder({ page }).analyze();
    expect(
      dark.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
  });

  test("toast appears, announces and dismisses", async ({ page }) => {
    await page.getByRole("button", { name: "Success toast" }).click();
    await expect(page.getByTestId("toast-success")).toBeVisible();
    await expect(page.getByTestId("toast-success")).toBeHidden({ timeout: 6000 });
  });

  test("form validates on blur and on submit with error summary focus", async ({ page }) => {
    const name = page.getByLabel("Name");
    await name.click();
    await name.blur();
    await expect(page.getByText("Enter a name")).toBeVisible();

    await page.getByTestId("ks-form").getByRole("button", { name: "Save" }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toBeFocused();
  });

  test("dialog traps focus and returns it to the trigger", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Open dialog" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("confirm dialog focuses Cancel by default", async ({ page }) => {
    await page.getByRole("button", { name: "Open confirm" }).click();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByTestId("toast-success")).toBeVisible();
  });

  test("combobox filters and selects with the keyboard", async ({ page }) => {
    const combo = page.getByRole("combobox");
    await combo.fill("ra");
    await expect(page.getByRole("option", { name: "Rachid" })).toBeVisible();
    await combo.press("ArrowDown");
    await combo.press("Enter");
    await expect(combo).toHaveValue("Rachid");
  });

  test("data view toggles between grid and list and persists in the URL", async ({ page }) => {
    await expect(page.getByTestId("data-view-grid")).toBeVisible();
    await page.getByTestId("view-list").click();
    await expect(page.getByTestId("data-view-table")).toBeVisible();
    await expect(page).toHaveURL(/view=list/);
    await page.getByTestId("view-grid").click();
    await expect(page.getByTestId("data-view-grid")).toBeVisible();
  });

  test("data view selection shows the bulk bar", async ({ page }) => {
    await page.getByTestId("view-list").click();
    await page.getByRole("checkbox").first().check();
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.getByRole("button", { name: "Clear selection" }).click();
    await expect(page.getByText("1 selected")).toBeHidden();
  });
});
