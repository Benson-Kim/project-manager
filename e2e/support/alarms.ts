import { expect, type Page } from "@playwright/test";
import { messages } from "../../src/lib/messages";

/**
 * Closes the to-do alarm toast. e2e-pm's seeded overdue alert (db/seed/028) is
 * announced once per browser session, and the toast stays until closed, so it
 * can cover a sheet's footer buttons. While a sheet is open the toast region is
 * aria-hidden (modal), so the button is found with includeHidden.
 */
export async function closeAlarmToast(page: Page): Promise<void> {
  const alarm = page
    .getByTestId("toast-warning")
    .filter({ hasText: messages.todoItems.alarmDue("E2E overdue alert") });
  await alarm.getByRole("button", { name: messages.actions.close, includeHidden: true }).click();
  await expect(alarm).toHaveCount(0);
}
