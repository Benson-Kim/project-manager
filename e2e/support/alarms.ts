import { expect, type Page } from "@playwright/test";
import { messages } from "../../src/lib/messages";

/**
 * Closes to-do alarm toasts. Wait for the seeded overdue alert (db/seed/028) so the
 * poll has completed, then close both it and any source-data alarms that are due.
 * Persistent alarms can cover a sheet's controls. While a sheet is open the toast
 * region is aria-hidden (modal), so its close button is found with includeHidden.
 */
export async function closeAlarmToast(page: Page): Promise<void> {
  const seeded = page
    .getByTestId("toast-warning")
    .filter({ hasText: messages.todoItems.alarmDue("E2E overdue alert") });
  await expect(seeded).toBeVisible();
  const alarms = page.getByTestId("toast-warning").filter({
    hasText: messages.todoItems.alarmDue(""),
  });
  while ((await alarms.count()) > 0) {
    await alarms
      .first()
      .getByRole("button", { name: messages.actions.close, includeHidden: true })
      .click();
  }
  await expect(alarms).toHaveCount(0);
}
