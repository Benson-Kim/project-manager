import { describe, expect, it } from "vitest";
import { keywordFormSchema, updateKeywordFormSchema } from "../schemas/keyword-form";

/**
 * Keyword form contract (#8): FormData strings → repository input shape.
 * Covers required keyword, optional definition → null, supplierId / rowVer
 * coercion  single-schema rule).
 */

const minimal = { projectId: "2", keyword: "MSSS" };

describe("keywordFormSchema", () => {
  it("parses a minimal create form — definition becomes null", () => {
    const parsed = keywordFormSchema.parse(minimal);
    expect(parsed.projectId).toBe(2);
    expect(parsed.keyword).toBe("MSSS");
    expect(parsed.definition).toBeNull();
  });

  it("keeps a supplied definition", () => {
    const parsed = keywordFormSchema.parse({ ...minimal, definition: "Ministère de la Santé" });
    expect(parsed.definition).toBe("Ministère de la Santé");
  });

  it("coerces empty-string definition to null", () => {
    const parsed = keywordFormSchema.parse({ ...minimal, definition: "  " });
    expect(parsed.definition).toBeNull();
  });

  it("rejects an empty keyword", () => {
    const result = keywordFormSchema.safeParse({ projectId: "2", keyword: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "keyword")).toBe(true);
    }
  });

  it("rejects a missing keyword", () => {
    const result = keywordFormSchema.safeParse({ projectId: "2" });
    expect(result.success).toBe(false);
  });

  it("allows null projectId (global keyword)", () => {
    const parsed = keywordFormSchema.parse({ projectId: null, keyword: "MSSS" });
    expect(parsed.projectId).toBeNull();
  });
});

describe("updateKeywordFormSchema", () => {
  it("coerces keywordId and rowVer from FormData strings", () => {
    const parsed = updateKeywordFormSchema.parse({
      ...minimal,
      keywordId: "5",
      rowVer: "42",
    });
    expect(parsed.keywordId).toBe(5);
    expect(parsed.rowVer).toBe(42);
  });
});
