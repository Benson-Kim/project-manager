import { describe, expect, it } from "vitest";
import { messages } from "@/lib/messages";

/** The WBS quick add says what a Meets pick will do, before and after the text is typed. */

const W = messages.keyDeliverables.wbs.quickAdd;

describe("WBS quick add Meets hint", () => {
  it("names the picked need while the text is still empty", () => {
    expect(W.meetsHint("BR-5", false)).toContain("BR-5");
    expect(W.meetsHint("BR-5", false)).toMatch(/^Type the requirement/);
  });

  it("says Enter adds it once text is typed", () => {
    expect(W.meetsHint("SR-2", true)).toBe("Enter adds it, traced to SR-2");
  });

  it("explains Meets in the field's title", () => {
    expect(W.meetsTitle).toMatch(/traceability/);
  });
});
