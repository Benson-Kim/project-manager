import type { LinkRule } from "../schemas/link-rules";
import { REQUIREMENT_TYPES } from "../schemas/requirement-types";

const RUNGS: Record<LinkRule["upstreamType"], number> = {
  WBS: 0,
  BR: 1,
  SR: 2,
  FR: 3,
  NFR: 3,
  TR: 4,
  TC: 5,
};

const UPSTREAM_ENDS = Object.keys(RUNGS) as LinkRule["upstreamType"][];

/** The 28 rules migration 063 seeds: a type may trace to its own rung or any rung below it. */
export const SEED_LINK_RULES: readonly LinkRule[] = REQUIREMENT_TYPES.flatMap((downstreamType) =>
  UPSTREAM_ENDS.filter((upstreamType) => RUNGS[downstreamType] >= RUNGS[upstreamType]).map(
    (upstreamType) => ({ downstreamType, upstreamType }),
  ),
);
