import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { escapeRegExp, openListed } from "./support/datasheet";

/**
 * Decision log — project-scoped route /projects/2/decisions. Create with impacted areas and
 * consulted people, an edit that keeps both sets, search by the DEC reference, supersede, axe.
 * Runs as e2e-pm (storage state from auth.setup.ts). The impacted-area list is seeded by
 * migration 057 (Scope, Budget, Timeline, Architecture, User experience).
 */

const M = messages.decisions;
const LIST = "/projects/2/decisions";

async function saved(page: Page, toast: string): Promise<void> {
  await expect(page.getByTestId("toast-success").filter({ hasText: toast }).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("decision-form")).toHaveCount(0);
}

async function pick(form: Locator, field: string, option: string): Promise<void> {
  const box = form.getByRole("combobox", { name: field, exact: true });
  await box.click();
  await box.fill(option);
  await form.getByRole("option", { name: option, exact: true }).click();
}

async function create(page: Page, title: string): Promise<Locator> {
  await page.goto(`${LIST}?id=new`);
  await page.waitForLoadState("networkidle");
  const form = page.getByTestId("decision-form");
  await expect(form).toBeVisible();
  await form.getByLabel(M.decisionTitle, { exact: true }).fill(title);
  return form;
}

/** Opens the decision from the grid and returns its id from the synced URL. */
async function open(page: Page, title: string): Promise<{ form: Locator; id: string }> {
  await page.goto(`${LIST}?view=grid&q=${encodeURIComponent(title)}`);
  await openListed(page, title);
  await page.waitForLoadState("networkidle");
  const form = page.getByTestId("decision-form");
  await expect(form).toBeVisible();
  await expect(form.getByLabel(M.decisionTitle, { exact: true })).toHaveValue(title);
  return { form, id: new URL(page.url()).searchParams.get("id") ?? "" };
}

test("a decision keeps its impacted areas and consulted people across an edit", async ({
  page,
}) => {
  const title = `E2E decision ${Date.now()}`;
  const form = await create(page, title);
  await pick(form, M.impactedAreas, "Budget");
  await pick(form, M.impactedAreas, "Timeline");

  const consulted = form.getByRole("combobox", { name: M.consulted, exact: true });
  await consulted.click();
  const person = form.getByRole("listbox").getByRole("option").first();
  const who = ((await person.textContent()) ?? "").trim();
  expect(who).not.toBe("");
  await person.click();
  await expect(form.getByRole("button", { name: M.removeChip(who) })).toBeVisible();

  await page.getByTestId("decision-save").click();
  await saved(page, messages.feedback.created);

  const first = await open(page, title);
  for (const label of ["Budget", "Timeline", who]) {
    await expect(first.form.getByRole("button", { name: M.removeChip(label) })).toBeVisible();
  }

  const edited = `${title} edited`;
  await first.form.getByLabel(M.decisionTitle, { exact: true }).fill(edited);
  await page.getByTestId("decision-save").click();
  await saved(page, messages.feedback.saved);

  const again = await open(page, edited);
  expect(again.id).toBe(first.id);
  for (const label of ["Budget", "Timeline", who]) {
    await expect(again.form.getByRole("button", { name: M.removeChip(label) })).toBeVisible();
  }

  const heading = page.getByRole("heading", {
    name: new RegExp(`^DEC-\\d+ ${escapeRegExp(edited)}$`),
  });
  const ref = /^DEC-\d+/.exec((await heading.textContent()) ?? "")?.[0] ?? "";
  expect(ref).not.toBe("");

  await page.goto(`${LIST}?view=grid&q=${encodeURIComponent(ref)}`);
  await expect(page.getByText(`${ref} ${edited}`, { exact: true })).toBeVisible();
});

test("a superseded decision names the one that replaced it and stays in the log", async ({
  page,
}) => {
  const stamp = Date.now();
  const older = `E2E superseded ${stamp}`;
  const newer = `E2E replacement ${stamp}`;
  await create(page, older);
  await page.getByTestId("decision-save").click();
  await saved(page, messages.feedback.created);
  await create(page, newer);
  await page.getByTestId("decision-save").click();
  await saved(page, messages.feedback.created);

  const replacement = await open(page, newer);
  const { form } = await open(page, older);
  const supersededBy = form.getByLabel(M.supersededBy, { exact: true });
  await supersededBy.selectOption(replacement.id);
  await page.getByTestId("decision-save").click();
  await saved(page, messages.feedback.saved);

  const reopened = await open(page, older);
  await expect(reopened.form.getByLabel(M.supersededBy, { exact: true })).toHaveValue(
    replacement.id,
  );
  await page.goto(`${LIST}?view=grid&q=${encodeURIComponent(older)}`);
  await expect(
    page.getByLabel(new RegExp(`${escapeRegExp(older)}, ${M.superseded}$`)),
  ).toBeVisible();
});

test("axe scan on the decision log and its sheet has no serious or critical violations", async ({
  page,
}) => {
  await page.goto(`${LIST}?id=new`);
  await expect(page.getByTestId("decision-form")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});
