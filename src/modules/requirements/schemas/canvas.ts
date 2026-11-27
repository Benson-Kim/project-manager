import { z } from "zod";
import {
  HEX_COLOUR,
  LINE_ATTACH,
  LINE_ENDS,
  LINE_PATTERNS,
  LINE_SHAPES,
  LINE_SIDES,
  connectorStyleSchema,
} from "@/lib/connector-style";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { idSchema } from "./requirement-link";
import { requirementTypeSchema } from "./requirement-types";

const itemKindSchema = z.enum(["Requirement", "Wbs"]);
const positionSchema = z.int32().nullable();

export const canvasSummarySchema = z.object({
  RequirementCanvasId: z.number().int(),
  Name: z.string(),
  KeyDeliverableId: z.number().int().nullable(),
  NodeCount: z.number().int(),
  RowVer: rowVerSchema,
});
export type CanvasSummary = z.infer<typeof canvasSummarySchema>;

/** Title and Summary are cut to 400 characters for display: an edit reads the row by id. */
export const canvasItemSchema = z.object({
  Kind: itemKindSchema,
  ItemId: z.number().int(),
  Ref: z.string(),
  Type: z.union([requirementTypeSchema, z.literal("WBS")]),
  Title: z.string(),
  Summary: z.string().nullable(),
  Status: z.string().nullable(),
  ParentId: z.number().int().nullable(),
  OnCanvas: z.boolean(),
  X: positionSchema,
  Y: positionSchema,
  IsCollapsed: z.boolean(),
  OwnerName: z.string().nullish(),
});
export type CanvasItem = z.infer<typeof canvasItemSchema>;

export const canvasLinkSchema = z.object({
  UpstreamKind: itemKindSchema,
  UpstreamId: z.number().int(),
  DownstreamId: z.number().int(),
  LinkStatus: z.enum(["Proposed", "Active"]),
  RowVer: rowVerSchema,
  LineShape: z.enum(LINE_SHAPES).nullish(),
  LinePattern: z.enum(LINE_PATTERNS).nullish(),
  StartEnd: z.enum(LINE_ENDS).nullish(),
  EndEnd: z.enum(LINE_ENDS).nullish(),
  LineWeight: z.number().int().min(1).max(6).nullish(),
  LineColour: z.string().regex(HEX_COLOUR).nullish().catch(null),
  Attach: z.enum(LINE_ATTACH).nullish(),
  SourceSide: z.enum(LINE_SIDES).nullish(),
  TargetSide: z.enum(LINE_SIDES).nullish(),
  Jumps: z.boolean().nullish(),
  BranchFromId: z.number().int().nullish(),
  BranchAt: z.number().int().min(0).max(100).nullish(),
});
export type CanvasLink = z.infer<typeof canvasLinkSchema>;

export const CANVAS_NAME_MAX = 120;
export const CANVAS_MOVE_MAX = 2000;

const nameSchema = z.string().trim().min(1).max(CANVAS_NAME_MAX);
const nodeRefShape = { kind: itemKindSchema, itemId: idSchema };
const hasWholePosition = (v: { x: number | null; y: number | null }) =>
  (v.x === null) === (v.y === null);

export const createCanvasInput = z.object({
  projectId: idSchema,
  name: nameSchema,
  keyDeliverableId: idSchema.nullable().default(null),
});

/** keyDeliverableId is required here: a missing value must not read as taking the canvas off its WBS item. */
export const updateCanvasInput = z.object({
  canvasId: idSchema,
  name: nameSchema,
  keyDeliverableId: idSchema.nullable(),
  rowVer: rowVerSchema,
});

export const deleteCanvasInput = z.object({ canvasId: idSchema, rowVer: rowVerSchema });

export const addCanvasNodeInput = z
  .object({
    canvasId: idSchema,
    ...nodeRefShape,
    x: positionSchema.default(null),
    y: positionSchema.default(null),
  })
  .refine(hasWholePosition);

/** Every key is required: an omitted x is refused, and only an explicit null clears a position. */
export const moveCanvasNodesInput = z.object({
  canvasId: idSchema,
  nodes: z
    .array(
      z
        .object({ ...nodeRefShape, x: positionSchema, y: positionSchema, isCollapsed: z.boolean() })
        .refine(hasWholePosition),
    )
    .max(CANVAS_MOVE_MAX),
});

export const removeCanvasNodeInput = z.object({ canvasId: idSchema, ...nodeRefShape });

export const allocateRequirementInput = z.object({
  requirementId: idSchema,
  keyDeliverableId: idSchema,
});

/** rowVer is the allocation's, as usp_RequirementCanvas_Links sends it on a WBS link. */
export const unallocateRequirementInput = allocateRequirementInput.extend({
  rowVer: rowVerSchema,
});

export const setCanvasLinkStyleInput = z
  .object({
    canvasId: idSchema,
    upstreamKind: itemKindSchema,
    upstreamId: idSchema,
    downstreamId: idSchema,
    style: connectorStyleSchema,
    branchFromId: idSchema.nullable(),
    branchAt: z.number().int().min(0).max(100).nullable(),
  })
  .strict()
  .refine((v) => v.branchAt === null || v.branchFromId !== null)
  .refine((v) => v.branchFromId !== v.downstreamId);

export type CanvasNodeRef = { kind: z.infer<typeof itemKindSchema>; itemId: number };
export type CreateCanvasInput = z.output<typeof createCanvasInput>;
export type UpdateCanvasInput = z.output<typeof updateCanvasInput>;
export type DeleteCanvasInput = z.output<typeof deleteCanvasInput>;
export type AddCanvasNodeInput = z.output<typeof addCanvasNodeInput>;
export type MoveCanvasNodesInput = z.output<typeof moveCanvasNodesInput>;
export type SetCanvasLinkStyleInput = z.output<typeof setCanvasLinkStyleInput>;
export type RemoveCanvasNodeInput = z.output<typeof removeCanvasNodeInput>;
export type AllocateRequirementInput = z.output<typeof allocateRequirementInput>;
