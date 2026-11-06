import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";

const U = messages.settings.users;
const A = messages.settings.audit;
const L = messages.settings.linkRules;
const T = messages.requirements.types;
const USERS_LINK = 'main a[href="/settings/users"]';

/**
 * Settings > Users. An Admin adds, edits, resets, deactivates and reactivates an account; a User
 * never reaches the page, and the deactivation shows in the audit log, which a User never reaches
 * either. The account is left deactivated, and its temporary passwords are made
 * at run time and never used to sign in.
 */
async function expectToast(page: Page, title: string) {
  await expect(page.getByTestId("toast-success").filter({ hasText: title }).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function signInAsAdmin(page: Page) {
  const password = process.env.E2E_USER_PASSWORD;
  if (!password) throw new Error("E2E_USER_PASSWORD must be set for the e2e suite");
  await page.goto("/login");
  await page.getByLabel(messages.auth.username).fill("e2e-admin");
  await page.getByLabel(messages.auth.password).fill(password);
  await page.getByRole("button", { name: messages.auth.signIn }).click();
  await page.waitForURL("/");
}

test.describe("as an Admin", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("adds, edits, resets, deactivates and reactivates a user", async ({ page }) => {
    const username = `e2e-user-${Date.now().toString(36)}`;
    const temporaryPassword = () => `Tmp-${randomUUID()}`;

    await signInAsAdmin(page);

    await page.goto("/settings");
    await page.locator(USERS_LINK).click();
    await expect(page.getByRole("heading", { name: U.title, exact: true })).toBeVisible();
    await page.goto(`/settings/users?q=${username}`);
    const row = page.getByTestId("users-table").getByRole("row").filter({ hasText: username });
    const roleCell = row.getByRole("cell").nth(2);

    await page.getByTestId("add-user").click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel(U.username, { exact: true }).fill(username);
    await dialog.getByLabel(U.displayName, { exact: true }).fill("E2E Added User");
    await dialog.getByLabel(U.temporaryPassword, { exact: true }).fill(temporaryPassword());
    await dialog.getByRole("button", { name: U.add }).click();
    await expectToast(page, U.created);
    await expect(row).toContainText("E2E Added User");
    await expect(roleCell).toHaveText(U.roles.User);
    await expect(row).toContainText(U.mustChangePassword);

    await row.getByRole("button", { name: U.edit }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel(U.displayName, { exact: true }).fill("E2E Edited User");
    await dialog.getByLabel(U.role, { exact: true }).selectOption("Admin");
    await expect(dialog).toContainText(U.roleChangeBody("E2E Added User"));
    await dialog.getByRole("button", { name: messages.actions.save }).click();
    await expectToast(page, messages.feedback.saved);
    await expect(row).toContainText("E2E Edited User");
    await expect(roleCell).toHaveText(U.roles.Admin);

    await row.getByRole("button", { name: U.resetPassword }).click();
    dialog = page.getByRole("dialog", { name: U.resetTitle("E2E Edited User") });
    await expect(dialog).toContainText(U.resetBody("E2E Edited User"));
    await dialog.getByLabel(U.temporaryPassword, { exact: true }).fill(temporaryPassword());
    await dialog.getByRole("button", { name: U.resetPassword }).click();
    await expectToast(page, U.reset);
    await expect(row).toContainText(U.mustChangePassword);

    await row.getByRole("button", { name: U.deactivate }).click();
    dialog = page.getByRole("dialog", { name: U.deactivateTitle("E2E Edited User") });
    await expect(dialog).toContainText(U.deactivateBody("E2E Edited User"));
    await dialog.getByRole("button", { name: U.deactivate }).click();
    await expectToast(page, U.deactivatedToast);
    await expect(row).toContainText(U.deactivated);

    await row.getByRole("button", { name: U.reactivate }).click();
    await expectToast(page, U.reactivatedToast);
    await expect(row).toContainText(U.mustChangePassword);

    const axe = await new AxeBuilder({ page }).include("main").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
      [],
    );

    await row.getByRole("button", { name: U.deactivate }).click();
    await page
      .getByRole("dialog", { name: U.deactivateTitle("E2E Edited User") })
      .getByRole("button", { name: U.deactivate })
      .click();
    await expect(row).toContainText(U.deactivated);

    // The deactivation is in the audit log, with what it changed.
    await page.goto("/settings");
    await page.getByTestId("audit-link").click();
    await expect(page.getByRole("heading", { name: A.title, exact: true })).toBeVisible();
    await page.goto("/settings/audit?q=Deactivate");
    const entries = page.getByTestId("audit-table").getByRole("row");
    await expect(entries.nth(1)).toBeVisible();
    await expect(page.getByTestId("audit-table")).toContainText("Deactivate");
    const auditAxe = await new AxeBuilder({ page }).include("main").analyze();
    expect(
      auditAxe.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);

    await entries.nth(1).getByRole("link").click();
    await expect(page.getByTestId("audit-diff")).toBeVisible();
    await expect(page.getByTestId("audit-diff").locator("tr[data-changed]").first()).toBeVisible();
    const entryAxe = await new AxeBuilder({ page }).include("main").analyze();
    expect(
      entryAxe.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);

    // The web edition has no backup file, so even an Admin gets no backup status page.
    expect((await page.goto("/settings/backup"))?.status()).toBe(404);
    await page.goto("/settings");
    await expect(page.getByTestId("audit-link")).toBeVisible();
    await expect(page.getByTestId("backup-link")).toHaveCount(0);
  });

  test("changes a link rule, keeps it after a reload and puts it back", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/settings");
    await page.getByTestId("link-rules-link").click();

    const cell = page
      .getByTestId("link-rules-matrix")
      .getByRole("checkbox", { name: L.cell(T.BR, T.TC), exact: true });
    const before = await cell.isChecked();

    const axe = await new AxeBuilder({ page }).include("main").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
      [],
    );

    for (const wanted of [!before, before]) {
      const saved = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" && response.url().includes("/settings/link-rules"),
      );
      await cell.setChecked(wanted);
      await saved;
      await page.reload();
      await expect(cell).toBeChecked({ checked: wanted });
    }
  });
});

test.describe("as a User", () => {
  test("never reaches Settings > Users and sees no link to it", async ({ page }) => {
    const response = await page.goto("/settings/users");
    expect(response?.status()).toBe(404);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(USERS_LINK)).toHaveCount(0);
  });

  test("never reaches the audit log or one of its entries", async ({ page }) => {
    expect((await page.goto("/settings/audit"))?.status()).toBe(404);
    expect((await page.goto("/settings/audit/1"))?.status()).toBe(404);
    expect((await page.goto("/settings/backup"))?.status()).toBe(404);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("audit-link")).toHaveCount(0);
    await expect(page.getByTestId("backup-link")).toHaveCount(0);
  });

  test("never reaches the link rules and sees no link to them", async ({ page }) => {
    expect((await page.goto("/settings/link-rules"))?.status()).toBe(404);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("link-rules-link")).toHaveCount(0);
  });
});
