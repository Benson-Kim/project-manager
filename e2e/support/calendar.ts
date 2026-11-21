import type { Page } from "@playwright/test";

/** A to-do's entry on a day of the month calendar, opening the day's "+N more" list when needed. */
export async function calendarEntry(page: Page, day: string, title: string) {
  const cell = page.locator(`[data-testid="calendar-day"][data-day="${day}"]`);
  const entry = cell.getByTestId("calendar-entry").filter({ hasText: title });
  if ((await entry.count()) > 0) return entry;
  await cell.getByTestId("calendar-more").click();
  return page.getByRole("dialog").getByTestId("calendar-entry").filter({ hasText: title });
}

/** The machine's own day moved by whole days: the browser and the app count this as today. */
export function localDay(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()]
    .map((n) => String(n).padStart(2, "0"))
    .join("-");
}
