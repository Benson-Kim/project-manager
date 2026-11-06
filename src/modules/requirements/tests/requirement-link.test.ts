import { describe, expect, it } from "vitest";
import {
  createRequirementLinkInput,
  linkEnds,
  updateRequirementLinkInput,
} from "../schemas/requirement-link";

describe("linkEnds", () => {
  const ROW = 10;
  const OTHER = 20;

  it("keeps the row downstream when the link is listed as upstream", () => {
    expect(linkEnds(ROW, { direction: "Upstream", linkedId: OTHER })).toEqual({
      requirementId: ROW,
      upstreamRequirementId: OTHER,
      keyDeliverableId: null,
    });
  });

  it("swaps the ends when the link is listed as downstream, as the procs name the lower row first", () => {
    expect(linkEnds(ROW, { direction: "Downstream", linkedId: OTHER })).toEqual({
      requirementId: OTHER,
      upstreamRequirementId: ROW,
      keyDeliverableId: null,
    });
  });

  it("names a WBS link by its deliverable, with no upstream requirement", () => {
    expect(linkEnds(ROW, { direction: "Wbs", linkedId: OTHER })).toEqual({
      requirementId: ROW,
      upstreamRequirementId: null,
      keyDeliverableId: OTHER,
    });
  });
});

describe("link input", () => {
  const update = { requirementId: 1, rationale: "Why", linkStatus: "Active", rowVer: 7 };

  it("takes exactly one end on an update", () => {
    expect(
      updateRequirementLinkInput.safeParse({ ...update, upstreamRequirementId: 2 }).success,
    ).toBe(true);
    expect(updateRequirementLinkInput.safeParse({ ...update, keyDeliverableId: 3 }).success).toBe(
      true,
    );
    expect(updateRequirementLinkInput.safeParse(update).success).toBe(false);
    expect(
      updateRequirementLinkInput.safeParse({
        ...update,
        upstreamRequirementId: 2,
        keyDeliverableId: 3,
      }).success,
    ).toBe(false);
  });

  it("requires a rationale on an update, so the procs never fall back to wiping it", () => {
    expect(
      updateRequirementLinkInput.safeParse({
        ...update,
        rationale: undefined,
        upstreamRequirementId: 2,
      }).success,
    ).toBe(false);
  });

  it("stores a blank rationale as nothing", () => {
    const parsed = updateRequirementLinkInput.parse({
      ...update,
      upstreamRequirementId: 2,
      rationale: "   ",
    });
    expect(parsed.rationale).toBeNull();
  });

  it("starts a new link Active with no rationale", () => {
    expect(
      createRequirementLinkInput.parse({ requirementId: 1, upstreamRequirementId: 2 }),
    ).toEqual({
      requirementId: 1,
      upstreamRequirementId: 2,
      rationale: null,
      linkStatus: "Active",
    });
  });

  it("drops a key the caller should not set", () => {
    const parsed = createRequirementLinkInput.parse({
      requirementId: 1,
      upstreamRequirementId: 2,
      createdBy: 99,
    });
    expect(parsed).not.toHaveProperty("createdBy");
  });
});
