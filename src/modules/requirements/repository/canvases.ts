import { execProc } from "@/lib/db";
import {
  canvasItemSchema,
  canvasLinkSchema,
  canvasSummarySchema,
  type AddCanvasNodeInput,
  type AllocateRequirementInput,
  type CanvasItem,
  type CanvasLink,
  type CanvasNodeRef,
  type CanvasSummary,
  type CreateCanvasInput,
  type DeleteCanvasInput,
  type MoveCanvasNodesInput,
  type RemoveCanvasNodeInput,
  type UpdateCanvasInput,
} from "../schemas/canvas";
import { execForProjectId } from "./requirements";

export async function listCanvases(
  projectId: number,
  actorUserId: number,
): Promise<CanvasSummary[]> {
  const rows = await execProc("usp_RequirementCanvas_List", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  return rows.map((r) => canvasSummarySchema.parse(r));
}

export async function listCanvasItems(
  canvasId: number,
  actorUserId: number,
): Promise<CanvasItem[]> {
  const rows = await execProc("usp_RequirementCanvas_Items", {
    RequirementCanvasId: canvasId,
    ActorUserId: actorUserId,
  });
  return rows.map((r) => canvasItemSchema.parse(r));
}

export async function listCanvasLinks(
  canvasId: number,
  actorUserId: number,
): Promise<CanvasLink[]> {
  const rows = await execProc("usp_RequirementCanvas_Links", {
    RequirementCanvasId: canvasId,
    ActorUserId: actorUserId,
  });
  return rows.map((r) => canvasLinkSchema.parse(r));
}

export async function createCanvas(
  input: CreateCanvasInput,
  actorUserId: number,
): Promise<CanvasSummary> {
  const rows = await execProc("usp_RequirementCanvas_Create", {
    ProjectId: input.projectId,
    Name: input.name,
    KeyDeliverableId: input.keyDeliverableId,
    ActorUserId: actorUserId,
  });
  return canvasSummarySchema.parse(rows[0]);
}

export function updateCanvas(input: UpdateCanvasInput, actorUserId: number): Promise<number> {
  return execForProjectId("usp_RequirementCanvas_Update", {
    RequirementCanvasId: input.canvasId,
    Name: input.name,
    KeyDeliverableId: input.keyDeliverableId,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
}

export function deleteCanvas(input: DeleteCanvasInput, actorUserId: number): Promise<number> {
  return execForProjectId("usp_RequirementCanvas_Delete", {
    RequirementCanvasId: input.canvasId,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
}

/** The one place a node's kind becomes the proc parameter that names it. */
function itemParams({ kind, itemId }: CanvasNodeRef) {
  return kind === "Requirement"
    ? { RequirementId: itemId, KeyDeliverableId: null }
    : { RequirementId: null, KeyDeliverableId: itemId };
}

export function addCanvasNode(input: AddCanvasNodeInput, actorUserId: number): Promise<number> {
  return execForProjectId("usp_RequirementCanvasNode_Add", {
    RequirementCanvasId: input.canvasId,
    ...itemParams(input),
    X: input.x,
    Y: input.y,
    ActorUserId: actorUserId,
  });
}

export function moveCanvasNodes(input: MoveCanvasNodesInput, actorUserId: number): Promise<number> {
  return execForProjectId("usp_RequirementCanvasNode_Move", {
    RequirementCanvasId: input.canvasId,
    NodesJson: JSON.stringify(input.nodes),
    ActorUserId: actorUserId,
  });
}

export function removeCanvasNode(
  input: RemoveCanvasNodeInput,
  actorUserId: number,
): Promise<number> {
  return execForProjectId("usp_RequirementCanvasNode_Remove", {
    RequirementCanvasId: input.canvasId,
    ...itemParams(input),
    ActorUserId: actorUserId,
  });
}

export function allocateRequirement(
  input: AllocateRequirementInput,
  actorUserId: number,
): Promise<number> {
  return execForProjectId("usp_Requirement_Allocate", {
    RequirementId: input.requirementId,
    KeyDeliverableId: input.keyDeliverableId,
    ActorUserId: actorUserId,
  });
}
