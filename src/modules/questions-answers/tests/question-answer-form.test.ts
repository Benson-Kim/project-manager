import { describe, expect, it } from "vitest";
import {
  questionAnswerFormSchema,
  updateQuestionAnswerFormSchema,
} from "../schemas/question-answer-form";

/**
 * QuestionAnswer form contract (#11): FormData strings → repository input shape.
 * Covers required question, optional fields → null, enum coercion, rowVer coercion.
 */

const minimal = { projectId: "2", question: "What is the scope?" };

describe("questionAnswerFormSchema", () => {
  it("parses a minimal create — optional fields become null", () => {
    const parsed = questionAnswerFormSchema.parse(minimal);
    expect(parsed.projectId).toBe(2);
    expect(parsed.question).toBe("What is the scope?");
    expect(parsed.answer).toBeNull();
    expect(parsed.category).toBeNull();
    expect(parsed.priority).toBeNull();
    expect(parsed.assignedTo).toBeNull();
  });

  it("trims and keeps a supplied question", () => {
    const parsed = questionAnswerFormSchema.parse({
      ...minimal,
      question: "  What is the scope?  ",
    });
    expect(parsed.question).toBe("What is the scope?");
  });

  it("rejects an empty question", () => {
    const result = questionAnswerFormSchema.safeParse({ ...minimal, question: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "question")).toBe(true);
    }
  });

  it("rejects a missing question", () => {
    const result = questionAnswerFormSchema.safeParse({ projectId: "2" });
    expect(result.success).toBe(false);
  });

  it("coerces empty-string answer to null", () => {
    const parsed = questionAnswerFormSchema.parse({ ...minimal, answer: "  " });
    expect(parsed.answer).toBeNull();
  });

  it("keeps a non-empty answer", () => {
    const parsed = questionAnswerFormSchema.parse({ ...minimal, answer: "Yes, it is." });
    expect(parsed.answer).toBe("Yes, it is.");
  });

  it("accepts valid category enum values", () => {
    for (const cat of ["General", "Technical", "Budget", "Other"] as const) {
      const parsed = questionAnswerFormSchema.parse({ ...minimal, category: cat });
      expect(parsed.category).toBe(cat);
    }
  });

  it("passes a category through; the proc checks it against the list (ADR-0022)", () => {
    const parsed = questionAnswerFormSchema.parse({ ...minimal, category: "InvalidCategory" });
    expect(parsed.category).toBe("InvalidCategory");
    expect(
      questionAnswerFormSchema.safeParse({ ...minimal, category: "x".repeat(51) }).success,
    ).toBe(false);
  });

  it("coerces empty-string category to null", () => {
    const parsed = questionAnswerFormSchema.parse({ ...minimal, category: "" });
    expect(parsed.category).toBeNull();
  });

  it("accepts valid priority enum values", () => {
    for (const p of ["Critical", "High", "Medium", "Low"] as const) {
      const parsed = questionAnswerFormSchema.parse({ ...minimal, priority: p });
      expect(parsed.priority).toBe(p);
    }
  });

  it("coerces empty-string priority to null", () => {
    const parsed = questionAnswerFormSchema.parse({ ...minimal, priority: "" });
    expect(parsed.priority).toBeNull();
  });

  it("trims assignedTo and keeps non-empty value", () => {
    const parsed = questionAnswerFormSchema.parse({ ...minimal, assignedTo: "  Alice  " });
    expect(parsed.assignedTo).toBe("Alice");
  });

  it("coerces empty-string assignedTo to null", () => {
    const parsed = questionAnswerFormSchema.parse({ ...minimal, assignedTo: "  " });
    expect(parsed.assignedTo).toBeNull();
  });
});

describe("updateQuestionAnswerFormSchema", () => {
  it("coerces questionAnswerId and rowVer from FormData strings", () => {
    const parsed = updateQuestionAnswerFormSchema.parse({
      ...minimal,
      questionAnswerId: "7",
      rowVer: "99",
    });
    expect(parsed.questionAnswerId).toBe(7);
    expect(parsed.rowVer).toBe(99);
  });

  it("requires questionAnswerId to be positive", () => {
    const result = updateQuestionAnswerFormSchema.safeParse({
      ...minimal,
      questionAnswerId: "0",
      rowVer: "1",
    });
    expect(result.success).toBe(false);
  });
});
