import { describe, expect, it } from "vitest";
import {
  allowedUpstreamTypes,
  allowsLink,
  linkCandidates,
  mergeTarget,
  typesKeepingLinks,
  type LinkRule,
} from "../schemas/link-rules";
import { SEED_LINK_RULES } from "./seed-link-rules";

const RULES: LinkRule[] = [
  { downstreamType: "TC", upstreamType: "BR" },
  { downstreamType: "TC", upstreamType: "FR" },
  { downstreamType: "TC", upstreamType: "WBS" },
  { downstreamType: "FR", upstreamType: "BR" },
  { downstreamType: "FR", upstreamType: "FR" },
];

describe("link rules (ADR-0060)", () => {
  it("reads a pair in its stated direction only", () => {
    expect(allowsLink(RULES, "TC", "FR")).toBe(true);
    expect(allowsLink(RULES, "FR", "TC")).toBe(false);
  });

  it("offers upstream types in catalog order and leaves WBS out", () => {
    expect(allowedUpstreamTypes(RULES, "TC")).toEqual(["BR", "FR"]);
    expect(allowedUpstreamTypes(RULES, "SR")).toEqual([]);
  });

  it("offers a type change only when every link stays allowed", () => {
    expect(
      typesKeepingLinks(RULES, { type: "TC", upstream: ["BR"], downstream: [], onWbs: false }),
    ).toEqual(["FR", "TC"]);
    expect(
      typesKeepingLinks(RULES, { type: "FR", upstream: ["BR"], downstream: ["FR"], onWbs: false }),
    ).toEqual(["FR"]);
    expect(
      typesKeepingLinks(RULES, { type: "TC", upstream: ["BR"], downstream: [], onWbs: true }),
    ).toEqual(["TC"]);
  });

  it("keeps the current type on offer after its rule is removed, as the Update proc judges only a change", () => {
    expect(
      typesKeepingLinks(RULES, { type: "SR", upstream: ["BR"], downstream: [], onWbs: false }),
    ).toEqual(["SR", "FR", "TC"]);
  });
});

describe("linkCandidates", () => {
  const options = [
    { id: 1, type: "BR" as const },
    { id: 2, type: "FR" as const },
    { id: 3, type: "FR" as const },
    { id: 4, type: "TC" as const },
    { id: 5, type: "SR" as const },
  ];
  const ids = (rows: readonly { id: number }[]) => rows.map((r) => r.id);

  it("reads the rules each way round from the row", () => {
    const { upstream, downstream } = linkCandidates(
      RULES,
      { id: 2, type: "FR" },
      options,
      new Set(),
    );
    expect(ids(upstream)).toEqual([1, 3]);
    expect(ids(downstream)).toEqual([3, 4]);
  });

  it("never offers the row itself", () => {
    const { upstream, downstream } = linkCandidates(
      RULES,
      { id: 3, type: "FR" },
      options,
      new Set(),
    );
    expect(ids(upstream)).not.toContain(3);
    expect(ids(downstream)).not.toContain(3);
  });

  it("drops a linked row from both lists, as the reverse of a link is a loop", () => {
    const { upstream, downstream } = linkCandidates(
      RULES,
      { id: 2, type: "FR" },
      options,
      new Set([3]),
    );
    expect(ids(upstream)).toEqual([1]);
    expect(ids(downstream)).toEqual([4]);
  });

  it("leaves a type no rule names on neither list", () => {
    const { upstream, downstream } = linkCandidates(
      RULES,
      { id: 2, type: "FR" },
      options,
      new Set(),
    );
    expect(ids([...upstream, ...downstream])).not.toContain(5);
  });
});

describe("seeded link rules", () => {
  it("has the 28 rules the migration seeds", () => {
    expect(SEED_LINK_RULES).toHaveLength(28);
  });
});

describe("mergeTarget", () => {
  const without = (...drop: LinkRule[]) =>
    SEED_LINK_RULES.filter(
      (r) =>
        !drop.some(
          (d) => d.downstreamType === r.downstreamType && d.upstreamType === r.upstreamType,
        ),
    );

  it("merges needs into the first solution and solutions into a test case", () => {
    expect(mergeTarget(SEED_LINK_RULES, ["BR"])).toBe("FR");
    expect(mergeTarget(SEED_LINK_RULES, ["BR", "SR", "SR"])).toBe("FR");
    expect(mergeTarget(SEED_LINK_RULES, ["FR", "NFR", "TR"])).toBe("TC");
  });

  it("goes below every selected row, so a need and a solution give a test case", () => {
    expect(mergeTarget(SEED_LINK_RULES, ["BR", "FR"])).toBe("TC");
  });

  it("has no target for a test case or an empty selection", () => {
    expect(mergeTarget(SEED_LINK_RULES, ["TC"])).toBeNull();
    expect(mergeTarget(SEED_LINK_RULES, [])).toBeNull();
  });

  it("moves on to the next type when a rule is removed", () => {
    const noFrToBr = without({ downstreamType: "FR", upstreamType: "BR" });
    expect(mergeTarget(noFrToBr, ["BR"])).toBe("NFR");
  });

  it("has no target when no type below may trace to every row", () => {
    const noTcToFr = without({ downstreamType: "TC", upstreamType: "FR" });
    expect(mergeTarget(noTcToFr, ["FR"])).toBeNull();
  });
});
