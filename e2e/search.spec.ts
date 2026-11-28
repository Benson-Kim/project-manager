import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { expectListed } from "./support/datasheet";

/**
 * V18 Global Search across projects (ADR-0073).
 * Runs as e2e-pm (storage state from auth.setup.ts).
 */

test("cross-project keyword search from header navigates to project register with sheet open", async ({
  page,
}) => {
  const stamp = Date.now().toString(36);
  const projectBName = `E2E Search B ${stamp}`;
  const kwPrefix = `KwCross_${stamp}`;

  // Create a second project owned by e2e-pm.
  await page.goto("/projects/new");
  await page.getByLabel(messages.projects.name).fill(projectBName);
  await page.getByTestId("project-save").click();
  await page.waitForURL(/\/projects\/\d+/);
  const projectBId = Number(/\/projects\/(\d+)/.exec(page.url())?.[1]);
  expect(projectBId).toBeGreaterThan(0);

  // Add matching keywords in Project 2 (seeded) and Project B.
  await page.goto("/projects/2/keywords?id=new");
  const formA = page.getByTestId("keyword-form");
  await expect(formA).toBeVisible();
  await formA.getByLabel(messages.keywords.keyword).fill(`${kwPrefix}_A`);
  await page.getByTestId("keyword-save").click();
  await expect(formA).toHaveCount(0);

  await page.goto(`/projects/${projectBId}/keywords?id=new`);
  const formB = page.getByTestId("keyword-form");
  await expect(formB).toBeVisible();
  await formB.getByLabel(messages.keywords.keyword).fill(`${kwPrefix}_B`);
  await page.getByTestId("keyword-save").click();
  await expect(formB).toHaveCount(0);

  // Search from the desktop header input.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const headerInput = page.getByTestId("header-search-input");
  await headerInput.fill(kwPrefix);
  await headerInput.press("Enter");
  await page.waitForURL(/\/search\?q=/);

  const kwGroup = page.getByTestId("search-group-keyword");
  await expect(kwGroup).toBeVisible();
  await expect(kwGroup.getByText(`${kwPrefix}_A`)).toBeVisible();
  await expect(kwGroup.getByText(`${kwPrefix}_B`)).toBeVisible();
  await expect(kwGroup.getByRole("link", { name: "Upgrade Inventory Management" })).toBeVisible();
  await expect(kwGroup.getByRole("link", { name: projectBName })).toBeVisible();

  // Hand off into Project B's keywords register with ?q= and ?id= opening the sheet.
  await kwGroup.getByRole("link", { name: new RegExp(`${kwPrefix}_B`) }).click();
  await page.waitForURL(new RegExp(`/projects/${projectBId}/keywords\\?q=.*&id=\\d+`));
  const destForm = page.getByTestId("keyword-form");
  await expect(destForm).toBeVisible();
  await expect(destForm.getByLabel(messages.keywords.keyword)).toHaveValue(`${kwPrefix}_B`);
  await destForm.getByRole("button", { name: messages.actions.cancel }).click();
  await expect(destForm).toHaveCount(0);
  await expect(page.getByTestId("keywords-search")).toHaveValue(kwPrefix);
  await expectListed(page, `${kwPrefix}_B`);
});

test("widened stakeholder full-name/role and supplier email search with kind filters and hand-off", async ({
  page,
}) => {
  const stamp = Date.now().toString(36);
  const firstName = `Elena_${stamp}`;
  const lastName = `Vance_${stamp}`;
  const projectRole = `Lead Architect_${stamp}`;
  const supplierName = `Acme_${stamp}`;
  const supplierEmail = `vendor.${stamp}@acme.test`;

  await page.goto("/projects/2/stakeholders?id=new");
  const shForm = page.getByTestId("stakeholder-form");
  await expect(shForm).toBeVisible();
  await shForm.getByLabel(messages.stakeholders.firstName).fill(firstName);
  await shForm.getByLabel(messages.stakeholders.lastName).fill(lastName);
  await shForm.getByLabel(messages.stakeholders.projectRole).fill(projectRole);
  await page.getByTestId("stakeholder-save").click();
  await expect(shForm).toHaveCount(0);

  await page.goto("/projects/2/suppliers?id=new");
  const spForm = page.getByTestId("supplier-form");
  await expect(spForm).toBeVisible();
  await spForm.getByLabel(messages.suppliers.supplierName).fill(supplierName);
  await spForm.getByLabel(messages.suppliers.emailAddress).fill(supplierEmail);
  await page.getByTestId("supplier-save").click();
  await expect(spForm).toHaveCount(0);

  // Full-name search + hand-off.
  await page.goto(`/search?q=${encodeURIComponent(`${firstName} ${lastName}`)}`);
  const shGroup = page.getByTestId("search-group-stakeholder");
  await expect(shGroup).toBeVisible();
  await shGroup.getByRole("link", { name: new RegExp(`${firstName} ${lastName}`) }).click();
  await page.waitForURL(/\/projects\/2\/stakeholders\?q=.*&id=\d+/);
  await expect(page.getByTestId("stakeholder-form")).toBeVisible();
  await page
    .getByTestId("stakeholder-form")
    .getByRole("button", { name: messages.actions.cancel })
    .click();
  await expectListed(page, firstName);

  // ProjectRole search + hand-off.
  await page.goto(`/search?q=${encodeURIComponent(projectRole)}`);
  await expect(
    page.getByTestId("search-group-stakeholder").getByText(`${firstName} ${lastName}`),
  ).toBeVisible();

  // Supplier EmailAddress search + kind filter toggle + hand-off.
  await page.goto(`/search?q=${encodeURIComponent(supplierEmail)}`);
  await page.getByTestId("search-filter-supplier").click();
  await expect(page.getByTestId("search-filter-supplier")).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/kinds=supplier/);
  const spGroup = page.getByTestId("search-group-supplier");
  await expect(spGroup).toBeVisible();
  await spGroup.getByRole("link", { name: new RegExp(supplierName) }).click();
  await page.waitForURL(/\/projects\/2\/suppliers\?q=.*&id=\d+/);
  await expect(page.getByTestId("supplier-form")).toBeVisible();
  await page
    .getByTestId("supplier-form")
    .getByRole("button", { name: messages.actions.cancel })
    .click();
  await expectListed(page, supplierName);
});

test("projectless keywords render as non-navigable 'No project' cards and bad URL params stay safe", async ({
  page,
}) => {
  await page.goto("/search?q=hey");
  const card = page.getByTestId("search-hit-keyword-23");
  await expect(card).toBeVisible();
  await expect(card).toContainText("hey");
  await expect(card).toContainText(messages.search.noProject);
  await expect(card.getByRole("link")).toHaveCount(0);

  await page.goto("/search?q=a");
  await expect(page.getByTestId("search-prompt")).toContainText(messages.search.minLength);

  await page.goto(`/search?q=${"x".repeat(101)}`);
  await expect(page.getByTestId("search-validation-error")).toContainText(
    messages.search.maxLength,
  );

  await page.goto("/search?q=test&kinds=keyword,");
  await expect(page.getByTestId("search-validation-error")).toContainText(
    messages.search.invalidKinds,
  );
});

test("375px mobile header search overlay fits with zero overflow and passes axe in light and dark mode", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto("/");

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasOverflow).toBe(false);

  const trigger = page.getByTestId("header-search-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();

  const overlay = page.getByTestId("header-search-overlay");
  const overlayInput = page.getByTestId("header-search-overlay-input");
  await expect(overlay).toBeVisible();
  await expect(overlayInput).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await overlayInput.fill("hey");
  await page.getByTestId("header-search-overlay-submit").click();
  await page.waitForURL(/\/search\?q=hey/);
  await expect(overlay).toHaveCount(0);
  await expect(page.getByTestId("search-hit-keyword-23")).toBeVisible();

  const light375 = await new AxeBuilder({ page }).analyze();
  expect(
    light375.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);

  await page.setViewportSize({ width: 1280, height: 800 });
  const lightDesktop = await new AxeBuilder({ page }).analyze();
  expect(
    lightDesktop.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);

  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkDesktop = await new AxeBuilder({ page }).analyze();
  expect(
    darkDesktop.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);

  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
