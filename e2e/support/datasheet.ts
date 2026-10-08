import { expect, type Page } from "@playwright/test";

/** Escapes a literal for use inside a RegExp. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A record is listed. Cards and read-only cells show it as text; in a list-view
 * datasheet (ADR-0023) an editable cell holds it as an input value instead, and
 * every cell's accessible name carries the row label ("To-do, Call vendor").
 */
export async function expectListed(page: Page, text: string): Promise<void> {
  await expect(
    page
      .getByText(text)
      .or(page.getByRole("textbox", { name: new RegExp(escapeRegExp(text)) }))
      .first(),
  ).toBeVisible();
}
