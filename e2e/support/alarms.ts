import { expect, type Page } from "@playwright/test";
import { messages } from "../../src/lib/messages";

/**
 * Closes to-do alarm toasts. Wait for the seeded overdue alert (db/seed/028) in the
 * bell's due list so the poll has completed, even after a reload suppresses its
 * already-announced toast. Close any alarm toasts that are still present.
 * Persistent alarms can cover a sheet's controls. While a sheet is open the toast
 * region is aria-hidden (modal), so its close button is found with includeHidden.
 */
export async function closeAlarmToast(page: Page): Promise<void> {
  await expect(
    page.getByTestId("due-alarms").getByText("E2E overdue alert", { exact: true }),
  ).toBeAttached();
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
