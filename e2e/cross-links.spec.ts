import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { closeAlarmToast } from "./support/alarms";

/**
 * 1-to-1 Cross-Links + Small Page Notes (ADR-0074).
 * Exercises the Web context-menu fallback (!window.desktop), two-step Pending
 * Portal Dock across windows, inline row & strip chips, jump/return navigation,
 * edit/delete confirmations, print hiding, and WCAG AA accessibility.
 */

const C = messages.crossLinks;

async function axeClean(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("creates, edits, and removes a private page note via web right-click and hides it in print", async ({
  page,
}) => {
  const stamp = Date.now();
  const noteBody = `E2E private note ${stamp}`;
  const updatedBody = `E2E private note edited ${stamp}`;

  await page.goto("/");
  await expect(page.getByTestId("page-title")).toBeVisible();
  await closeAlarmToast(page);

  await page.getByTestId("page-title").click({ button: "right" });
  const addNoteItem = page.getByTestId("cl-menu-add-note");
  await expect(addNoteItem).toBeVisible();
  await addNoteItem.click();

  const dialog = page.getByRole("dialog", { name: C.dialogCreateNoteTitle });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(C.dialogNoteBodyLabel).fill(noteBody);
  await dialog.getByRole("button", { name: C.colors.blue }).click();
  await dialog.getByRole("button", { name: messages.actions.save }).click();
  await expect(dialog).toBeHidden();

  const strip = page.getByTestId("page-stickies-strip");
  await expect(strip).toBeVisible();
  await expect(strip).toContainText(noteBody);
  await expect(strip).toContainText(C.privateNoteTag);

  // Verify print:hidden conceals sticky notes cleanly.
  await page.emulateMedia({ media: "print" });
  await expect(strip).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  // Reload confirms persistence from SQL.
  await page.reload();
  await expect(page.getByTestId("page-stickies-strip")).toContainText(noteBody);

  // Edit note.
  const card = page
    .locator('[data-testid^="strip-page-note-"]')
    .filter({ hasText: noteBody })
    .first();
  await card.getByRole("button", { name: C.editAction }).click();
  const editDialog = page.getByRole("dialog", { name: C.dialogEditNoteTitle });
  await editDialog.getByLabel(C.dialogNoteBodyLabel).fill(updatedBody);
  await editDialog.getByRole("button", { name: messages.actions.save }).click();
  await expect(editDialog).toBeHidden();
  await expect(page.getByTestId("page-stickies-strip")).toContainText(updatedBody);

  await axeClean(page);

  // Clean up via ConfirmDialog.
  const updatedCard = page
    .locator('[data-testid^="strip-page-note-"]')
    .filter({ hasText: updatedBody })
    .first();
  await updatedCard.getByRole("button", { name: C.deleteAction }).click();
  const confirm = page.getByRole("dialog", { name: C.confirmDeleteNoteTitle });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: C.deleteAction }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByTestId("page-stickies-strip")).not.toContainText(updatedBody);
});

test("creates a 1-to-1 cross-link across windows via Pending Portal Dock, jumps, returns, and deletes", async ({
  page,
  context,
}) => {
  const stamp = Date.now();
  const riskDesc = `E2E link risk ${stamp}`;
  const linkTitle = `E2E link title ${stamp}`;
  const updatedTitle = `E2E link updated ${stamp}`;

  // Seed one Risk row on Project 2.
  await page.goto("/projects/2/risks-issues?view=list&id=new");
  const form = page.getByTestId("risk-issue-form");
  const descBox = form.getByRole("textbox", { name: messages.risksIssues.description });
  await descBox.fill(riskDesc);
  await page.getByTestId("risk-issue-save").click();
  await expect(page.getByTestId("toast-success").first()).toBeVisible({ timeout: 15_000 });
  await page.goto(`/projects/2/risks-issues?view=list&q=${encodeURIComponent(riskDesc)}`);
  await closeAlarmToast(page);

  const row = page.locator("tr[data-cl-anchor='record']").filter({ hasText: riskDesc }).first();
  await expect(row).toBeVisible();
  await row.click({ button: "right" });
  await page.getByTestId("cl-menu-add-link").click();

  const dock = page.getByTestId("pending-cross-link-dock");
  await expect(dock).toBeVisible();
  await expect(dock).toContainText(riskDesc);

  // Second window sees synchronized Pending Portal Dock via BroadcastChannel and completes link.
  const second = await context.newPage();
  await second.goto("/projects/2/decisions?view=list");
  await closeAlarmToast(second);
  await expect(second.getByTestId("pending-cross-link-dock")).toBeVisible({ timeout: 10_000 });
  await second.getByTestId("pending-cross-link-complete-here").click();

  const linkDialog = second.getByRole("dialog", { name: C.dialogCreateLinkTitle });
  await expect(linkDialog).toBeVisible();
  await linkDialog.getByLabel(C.dialogLinkTitleLabel).fill(linkTitle);
  await linkDialog.getByRole("button", { name: messages.actions.save }).click();
  await expect(linkDialog).toBeHidden();
  await expect(second.getByTestId("pending-cross-link-dock")).toBeHidden();

  const secondStrip = second.getByTestId("page-stickies-strip");
  await expect(secondStrip).toContainText(linkTitle);

  // Jump from End B (Decisions) back to End A (Risk row) and confirm arrival banner + return link.
  const jumpLink = secondStrip
    .locator('[data-testid^="strip-cross-link-jump-"]')
    .filter({ hasText: riskDesc })
    .first();
  await jumpLink.click();
  await second.waitForURL(/\/projects\/2\/risks-issues/);
  await expect(second.locator("[data-cl-highlighted='true']").first()).toBeVisible();
  await expect(second.getByTestId("cross-link-return-link")).toBeVisible();

  await axeClean(second);

  // Edit & clean up link on Risk row.
  const chip = second
    .locator('[data-testid^="cross-link-chip-"]')
    .filter({ hasText: linkTitle })
    .first();
  await expect(chip).toBeVisible();
  await chip.getByRole("button", { name: new RegExp(C.editAction) }).click();
  const editLinkDialog = second.getByRole("dialog", { name: C.dialogEditLinkTitle });
  await editLinkDialog.getByLabel(C.dialogLinkTitleLabel).fill(updatedTitle);
  await editLinkDialog.getByRole("button", { name: messages.actions.save }).click();
  await expect(editLinkDialog).toBeHidden();

  const updatedChip = second
    .locator('[data-testid^="cross-link-chip-"]')
    .filter({ hasText: updatedTitle })
    .first();
  await updatedChip.getByRole("button", { name: new RegExp(C.editAction) }).click();
  const delBtn = second
    .getByRole("dialog", { name: C.dialogEditLinkTitle })
    .getByRole("button", { name: C.deleteAction });
  await delBtn.click();

  const confirm = second.getByRole("dialog", { name: C.confirmDeleteLinkTitle });
  await confirm.getByRole("button", { name: C.deleteAction }).click();
  await expect(confirm).toBeHidden();
  await expect(
    second.locator('[data-testid^="cross-link-chip-"]').filter({ hasText: updatedTitle }),
  ).toHaveCount(0);
  await second.close();
});
