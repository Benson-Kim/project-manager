import { execProc } from "@/lib/db";
import {
  diagramRowSchema,
  diagramSummarySchema,
  savedDiagramSchema,
  type CreateDiagramInput,
  type DeleteDiagramInput,
  type DiagramRow,
  type DiagramSummary,
  type RenameDiagramInput,
  type SaveDiagramInput,
  type SavedDiagram,
} from "../schemas/bpmn";

/** BPMN diagrams (ADR-0064). Every proc takes its project from the row and checks access itself. */

export async function listDiagrams(
  projectId: number,
  actorUserId: number,
): Promise<DiagramSummary[]> {
  const rows = await execProc("usp_BpmnDiagram_List", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  return rows.map((row) => diagramSummarySchema.parse(row));
}

export async function getDiagram(diagramId: number, actorUserId: number): Promise<DiagramRow> {
  const rows = await execProc("usp_BpmnDiagram_GetById", {
    BpmnDiagramId: diagramId,
    ActorUserId: actorUserId,
  });
  return diagramRowSchema.parse(rows[0]);
}

export async function createDiagram(
  input: CreateDiagramInput,
  actorUserId: number,
): Promise<DiagramSummary> {
  const rows = await execProc("usp_BpmnDiagram_Create", {
    ProjectId: input.projectId,
    Name: input.name,
    ActorUserId: actorUserId,
  });
  return diagramSummarySchema.parse(rows[0]);
}

export async function renameDiagram(
  input: RenameDiagramInput,
  actorUserId: number,
): Promise<DiagramSummary> {
  const rows = await execProc("usp_BpmnDiagram_Rename", {
    BpmnDiagramId: input.diagramId,
    Name: input.name,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return diagramSummarySchema.parse(rows[0]);
}

export async function saveDiagram(
  input: SaveDiagramInput,
  actorUserId: number,
): Promise<SavedDiagram> {
  const rows = await execProc("usp_BpmnDiagram_Update", {
    BpmnDiagramId: input.diagramId,
    DiagramJson: JSON.stringify(input.diagram),
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return savedDiagramSchema.parse(rows[0]);
}

export async function deleteDiagram(input: DeleteDiagramInput, actorUserId: number): Promise<void> {
  await execProc("usp_BpmnDiagram_Delete", {
    BpmnDiagramId: input.diagramId,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
}
