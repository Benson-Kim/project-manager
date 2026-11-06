import { z } from "zod";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { requirementTypeSchema } from "./requirement-types";

export const LINK_STATUSES = ["Proposed", "Active", "Retired"] as const;
export const linkStatusSchema = z.enum(LINK_STATUSES);
export type LinkStatus = z.infer<typeof linkStatusSchema>;

export const LINK_RATIONALE_MAX = 1000;

export const idSchema = z.coerce.number().int().positive();
const rationaleSchema = z
  .string()
  .trim()
  .max(LINK_RATIONALE_MAX)
  .nullable()
  .transform((v) => v || null);

/** @RequirementId is always the downstream row, whichever end the link was made from. */
export const createRequirementLinkInput = z.object({
  requirementId: idSchema,
  upstreamRequirementId: idSchema,
  rationale: rationaleSchema.default(null),
  linkStatus: linkStatusSchema.default("Active"),
});

/** A link to a requirement names upstreamRequirementId, one to a WBS item keyDeliverableId. */
export const updateRequirementLinkInput = z
  .object({
    requirementId: idSchema,
    upstreamRequirementId: idSchema.nullable().default(null),
    keyDeliverableId: idSchema.nullable().default(null),
    rationale: rationaleSchema,
    linkStatus: linkStatusSchema,
    rowVer: rowVerSchema,
  })
  .refine((v) => (v.upstreamRequirementId === null) !== (v.keyDeliverableId === null));

export const deleteRequirementLinkInput = z.object({
  requirementId: idSchema,
  upstreamRequirementId: idSchema,
  rowVer: rowVerSchema,
});

export type CreateRequirementLinkInput = z.output<typeof createRequirementLinkInput>;
export type UpdateRequirementLinkInput = z.output<typeof updateRequirementLinkInput>;
export type DeleteRequirementLinkInput = z.output<typeof deleteRequirementLinkInput>;

/** One row of usp_RequirementLink_List. ref and text are null on a WBS link. */
export const requirementLinkRowSchema = z
  .object({
    Direction: z.enum(["Upstream", "Downstream", "Wbs"]),
    LinkedId: z.number().int(),
    LinkedType: z.union([requirementTypeSchema, z.literal("WBS")]),
    LinkedRef: z.string().nullable(),
    LinkedText: z.string().nullable(),
    Rationale: z.string().nullable(),
    LinkStatus: linkStatusSchema,
    CreatedAtUtc: z.date(),
    CreatedByName: z.string().nullable(),
    UpdatedAtUtc: z.date().nullable(),
    RowVer: rowVerSchema,
  })
  .transform((r) => ({
    direction: r.Direction,
    linkedId: r.LinkedId,
    linkedType: r.LinkedType,
    ref: r.LinkedRef,
    text: r.LinkedText,
    rationale: r.Rationale,
    status: r.LinkStatus,
    createdAt: r.CreatedAtUtc,
    createdByName: r.CreatedByName,
    updatedAt: r.UpdatedAtUtc,
    rowVer: r.RowVer,
  }));

export type RequirementLink = z.output<typeof requirementLinkRowSchema>;

/** The ends the link procs name, seen from `rowId`, whichever end the link is listed under. */
export function linkEnds(rowId: number, link: Pick<RequirementLink, "direction" | "linkedId">) {
  switch (link.direction) {
    case "Upstream":
      return {
        requirementId: rowId,
        upstreamRequirementId: link.linkedId,
        keyDeliverableId: null,
      };
    case "Downstream":
      return {
        requirementId: link.linkedId,
        upstreamRequirementId: rowId,
        keyDeliverableId: null,
      };
    case "Wbs":
      return {
        requirementId: rowId,
        upstreamRequirementId: null,
        keyDeliverableId: link.linkedId,
      };
  }
}
