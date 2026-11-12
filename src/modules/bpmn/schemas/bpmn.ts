import { z } from "zod";
import { rowVerSchema } from "@/modules/projects/schemas/project";
import { DIAGRAM_NAME_MAX, diagramSchema } from "../model/diagram";

const idSchema = z.coerce.number().int().positive();
const nameSchema = z.string().trim().min(1).max(DIAGRAM_NAME_MAX);

/** One row of usp_BpmnDiagram_List and _Create. */
export const diagramSummarySchema = z.object({
  BpmnDiagramId: z.number().int(),
  Name: z.string(),
  RowVer: rowVerSchema,
});
export type DiagramSummary = z.infer<typeof diagramSummarySchema>;

/** usp_BpmnDiagram_GetById: the drawing stays text here; the model reads it. */
export const diagramRowSchema = diagramSummarySchema.extend({
  ProjectId: z.number().int(),
  DiagramJson: z.string(),
});
export type DiagramRow = z.infer<typeof diagramRowSchema>;

export const savedDiagramSchema = z.object({
  BpmnDiagramId: z.number().int(),
  ProjectId: z.number().int(),
  RowVer: rowVerSchema,
});
export type SavedDiagram = z.infer<typeof savedDiagramSchema>;

export const createDiagramInput = z.strictObject({ projectId: idSchema, name: nameSchema });
export type CreateDiagramInput = z.infer<typeof createDiagramInput>;

export const renameDiagramInput = z.strictObject({
  diagramId: idSchema,
  name: nameSchema,
  rowVer: rowVerSchema,
});
export type RenameDiagramInput = z.infer<typeof renameDiagramInput>;

/** The drawing is checked whole here, so the proc only ever stores a document the app can read. */
export const saveDiagramInput = z.strictObject({
  diagramId: idSchema,
  diagram: diagramSchema,
  rowVer: rowVerSchema,
});
export type SaveDiagramInput = z.infer<typeof saveDiagramInput>;

export const deleteDiagramInput = z.strictObject({ diagramId: idSchema, rowVer: rowVerSchema });
export type DeleteDiagramInput = z.infer<typeof deleteDiagramInput>;
