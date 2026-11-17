import { describe, expect, it } from "vitest";
import { workspaceDiscussionPointSchema } from "../schemas/meeting";
import { decisionTitle, logDiscussionPointDecisionSchema } from "../schemas/meeting-form";

describe("logging a discussion point as a decision", () => {
  it("takes the point's text as the title, cut to 255 characters", () => {
    expect(decisionTitle("  Over by five percent  ", "Discussion point")).toBe(
      "Over by five percent",
    );
    expect(decisionTitle("x".repeat(300), "Discussion point")).toHaveLength(255);
  });

  it("falls back when the point has no text", () => {
    expect(decisionTitle("   ", "Discussion point")).toBe("Discussion point");
  });

  it("refuses a blank or overlong title", () => {
    const base = { meetingDiscussionPointId: 1, rowVer: 2 };
    expect(logDiscussionPointDecisionSchema.safeParse({ ...base, title: " " }).success).toBe(false);
    expect(
      logDiscussionPointDecisionSchema.safeParse({ ...base, title: "x".repeat(256) }).success,
    ).toBe(false);
    expect(logDiscussionPointDecisionSchema.safeParse({ ...base, title: "Go" }).success).toBe(true);
  });

  it("reads the linked decision on a point, null when there is none", () => {
    const point = {
      MeetingDiscussionPointId: 1,
      AgendaItemId: 1,
      DiscussionPoint: "<p>P</p>",
      SortOrder: 1,
      RowVer: 2,
      AssumptionConstraintId: null,
    };
    expect(
      workspaceDiscussionPointSchema.parse({ ...point, DecisionId: 7, DecisionNumber: 4 }),
    ).toMatchObject({ DecisionNumber: 4 });
    expect(
      workspaceDiscussionPointSchema.parse({ ...point, DecisionId: null, DecisionNumber: null })
        .DecisionId,
    ).toBeNull();
  });
});
