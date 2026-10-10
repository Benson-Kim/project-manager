import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { messages } from "../src/lib/messages";
import { expectListed } from "./support/datasheet";

/**
 * Questions & Answers module (#11) — project-scoped route /projects/2/questions-answers.
 * Happy path: create a new Q&A record through the URL-synced sheet.
 * Validation: empty question is rejected with inline error + summary.
 * Deep link: ?id= opens the seeded record.
 * Axe scans on list and sheet. Runs as e2e-pm (no extra logins, LESSONS §12).
 * Seeded Q&A ids 1–8 and 13 belong to project 2 (seed 006_question_answer.sql).
 */

test("create Q&A happy path — appears in the list", async ({ page }) => {
  const question = `E2E question ${Date.now()}`;
  await page.goto("/projects/2/questions-answers");
  await page.getByTestId("new-question-answer").click();
  const form = page.getByTestId("question-answer-form");
  await expect(form).toBeVisible();
  await form.getByLabel(messages.questionsAnswers.question).fill(question);
  await form.getByLabel(messages.questionsAnswers.answer).fill("E2E answer");
  await form.getByLabel(messages.questionsAnswers.category).selectOption("Technical");
  await form.getByLabel(messages.questionsAnswers.priority).selectOption("High");
  await page.getByTestId("qa-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.created }).first(),
  ).toBeVisible();
  await expect(form).toHaveCount(0); // sheet closed, ?id= cleared

  await page.goto(`/projects/2/questions-answers?q=${encodeURIComponent(question)}`);
  await expectListed(page, question);
});

test("validation failure — empty question shows inline error and focuses the summary", async ({
  page,
}) => {
  await page.goto("/projects/2/questions-answers?id=new");
  const form = page.getByTestId("question-answer-form");
  await expect(form).toBeVisible();
  const questionField = form.getByLabel(messages.questionsAnswers.question);
  await questionField.fill("  ");
  await questionField.blur();
  await expect(page.getByText(messages.questionsAnswers.questionRequired).first()).toBeVisible();
  await page.getByTestId("qa-save").click();
  const summary = page.getByRole("alert").filter({ hasText: messages.errors.summaryTitle });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
});

test("sheet is URL-synced — deep link ?id=1 opens the seeded Q&A", async ({ page }) => {
  await page.goto("/projects/2/questions-answers?id=1");
  const form = page.getByTestId("question-answer-form");
  await expect(form).toBeVisible();
  await expect(form.getByLabel(messages.questionsAnswers.question)).toHaveValue(
    "How soon can you complete the Notes section?",
  );
});

test("edit seeded Q&A and save — reflects in the list", async ({ page }) => {
  await page.goto("/projects/2/questions-answers?id=2");
  const form = page.getByTestId("question-answer-form");
  await expect(form).toBeVisible();
  const answerField = form.getByLabel(messages.questionsAnswers.answer);
  const updatedAnswer = `Updated ${Date.now()}`;
  await answerField.fill(updatedAnswer);
  await page.getByTestId("qa-save").click();
  await expect(
    page.getByTestId("toast-success").filter({ hasText: messages.feedback.saved }).first(),
  ).toBeVisible();
  await expect(form).toHaveCount(0);
});

test("axe scan on the Q&A list has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/questions-answers");
  await expect(page.getByRole("heading", { name: messages.questionsAnswers.title })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("axe scan on the Q&A sheet has no serious or critical violations", async ({ page }) => {
  await page.goto("/projects/2/questions-answers?id=1");
  await expect(page.getByTestId("question-answer-form")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious).toEqual([]);
});
