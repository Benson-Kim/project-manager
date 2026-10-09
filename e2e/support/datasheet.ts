import { expect, type Page } from "@playwright/test";
import { messages } from "../../src/lib/messages";

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

/**
 * Opens a listed record: its card in grid view, or its row's "Open" button in
 * a list-view datasheet (whose cells are inputs, not text).
 */
export async function openListed(page: Page, text: string): Promise<void> {
  await page
    .getByRole("button", { name: messages.datasheet.open(text) })
    .or(page.getByText(text))
    .first()
    .click();
}

/** No record shows `text` — neither as text nor as a datasheet cell value. */
export async function expectNotListed(page: Page, text: string): Promise<void> {
  await expect(page.getByText(text)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: new RegExp(escapeRegExp(text)) })).toHaveCount(0);
}
