import { z } from "zod";
import {
  REQUIREMENT_TYPES,
  requirementTypeSchema,
  sideOf,
  type RequirementType,
} from "./requirement-types";

/** What may sit upstream of a requirement: a WBS item or any requirement type. */
export const LINK_UPSTREAM_TYPES = ["WBS", ...REQUIREMENT_TYPES] as const;

export type LinkUpstreamType = (typeof LINK_UPSTREAM_TYPES)[number];

const linkUpstreamTypeSchema = z.enum(LINK_UPSTREAM_TYPES);

/** One allowed link (app.RequirementLinkRule, ADR-0060). The write procs have the last word. */
export interface LinkRule {
  downstreamType: RequirementType;
  upstreamType: LinkUpstreamType;
}

/** One row of usp_RequirementLinkRule_List. */
export const linkRuleRowSchema = z
  .object({
    DownstreamType: requirementTypeSchema,
    UpstreamType: linkUpstreamTypeSchema,
  })
  .transform((r): LinkRule => ({ downstreamType: r.DownstreamType, upstreamType: r.UpstreamType }));

/** One cell of the Settings matrix; the proc writes one cell at a time. */
export const setLinkRuleInput = z.object({
  downstreamType: requirementTypeSchema,
  upstreamType: linkUpstreamTypeSchema,
  allowed: z.boolean(),
});

export type SetLinkRuleInput = z.infer<typeof setLinkRuleInput>;

/** The rules once one cell changes, shown before the server answers. */
export function withLinkRule(
  rules: readonly LinkRule[],
  { downstreamType, upstreamType, allowed }: SetLinkRuleInput,
): LinkRule[] {
  const others = rules.filter(
    (r) => r.downstreamType !== downstreamType || r.upstreamType !== upstreamType,
  );
  return allowed ? [...others, { downstreamType, upstreamType }] : others;
}

export function allowsLink(
  rules: readonly LinkRule[],
  downstreamType: RequirementType,
  upstreamType: LinkUpstreamType,
): boolean {
  return rules.some((r) => r.downstreamType === downstreamType && r.upstreamType === upstreamType);
}

/** The types a row of this type may trace to, in catalog order. */
export function allowedUpstreamTypes(
  rules: readonly LinkRule[],
  type: RequirementType,
): RequirementType[] {
  return REQUIREMENT_TYPES.filter((upstream) => allowsLink(rules, type, upstream));
}

export interface RowLinks {
  /** Its type now, always offered: usp_Requirement_Update judges links only on a type change. */
  type: RequirementType;
  upstream: readonly RequirementType[];
  downstream: readonly RequirementType[];
  onWbs: boolean;
}

/** The types a row may take and keep every link it has, as usp_Requirement_Update judges them. */
export function typesKeepingLinks(rules: readonly LinkRule[], links: RowLinks): RequirementType[] {
  return REQUIREMENT_TYPES.filter(
    (type) =>
      type === links.type ||
      (links.upstream.every((upstream) => allowsLink(rules, type, upstream)) &&
        links.downstream.every((downstream) => allowsLink(rules, downstream, type)) &&
        (!links.onWbs || allowsLink(rules, type, "WBS"))),
  );
}

/**
 * What a row can still link to, each way. Never itself, and never a row linked in either
 * direction, because the reverse of a link is always a loop.
 */
export function linkCandidates<T extends { id: number; type: RequirementType }>(
  rules: readonly LinkRule[],
  row: { id: number; type: RequirementType },
  options: readonly T[],
  linkedIds: ReadonlySet<number>,
): { upstream: T[]; downstream: T[] } {
  const open = options.filter((option) => option.id !== row.id && !linkedIds.has(option.id));
  return {
    upstream: open.filter((option) => allowsLink(rules, row.type, option.type)),
    downstream: open.filter((option) => allowsLink(rules, option.type, row.type)),
  };
}

const sideRank = (type: RequirementType) =>
  (["need", "solution", "test"] as const).indexOf(sideOf(type));

/**
 * What the selected rows can be merged into: the first type on a side below all of them that may
 * trace to every one, or null when the rules leave none.
 */
export function mergeTarget(
  rules: readonly LinkRule[],
  types: readonly RequirementType[],
): RequirementType | null {
  if (types.length === 0) return null;
  const lowest = Math.max(...types.map(sideRank));
  const fits = (target: RequirementType) =>
    sideRank(target) > lowest && types.every((type) => allowsLink(rules, target, type));
  return REQUIREMENT_TYPES.find(fits) ?? null;
}
