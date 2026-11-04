import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_IDLE_TIMEOUT_MINUTES, NEVER_IDLE_TIMEOUT } from "../src/lib/auth/idle-timeout";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";

async function openSettings(page: Page) {
  await page.goto("/settings");
  await closeAlarmToast(page);
  return page.getByTestId("idle-timeout-setting").getByLabel(messages.settings.signIn.idleTimeout);
}

async function chooseIdleTimeout(page: Page, minutes: number) {
  const select = await openSettings(page);
  await select.selectOption(String(minutes));
  const save = page
    .getByTestId("idle-timeout-setting")
    .getByRole("button", { name: messages.actions.save });
  if (await save.isDisabled()) return;
  await save.click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.saved }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

test("idle sign-out: the user picks Never, then 8 hours, and the choice survives a reload", async ({
  page,
}) => {
  try {
    await chooseIdleTimeout(page, NEVER_IDLE_TIMEOUT);
    let select = await openSettings(page);
    await expect(page).toHaveURL(/\/settings$/);
    await expect(select).toHaveValue(String(NEVER_IDLE_TIMEOUT));
    await expect(select.locator("option:checked")).toHaveText(
      messages.settings.signIn.after(NEVER_IDLE_TIMEOUT),
    );

    await chooseIdleTimeout(page, DEFAULT_IDLE_TIMEOUT_MINUTES);
    const axe = await new AxeBuilder({ page }).include("main").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
      [],
    );
    select = await openSettings(page);
    await expect(select).toHaveValue(String(DEFAULT_IDLE_TIMEOUT_MINUTES));
    await expect(select.locator("option:checked")).toHaveText(
      messages.settings.signIn.after(DEFAULT_IDLE_TIMEOUT_MINUTES),
    );
  } finally {
    await chooseIdleTimeout(page, DEFAULT_IDLE_TIMEOUT_MINUTES);
  }
});
