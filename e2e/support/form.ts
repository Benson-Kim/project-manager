import { expect, type Locator } from "@playwright/test";

/** A failed save lands on the field to fix: it has focus and is marked invalid. */
export async function expectFocusOnInvalid(field: Locator): Promise<void> {
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
}
