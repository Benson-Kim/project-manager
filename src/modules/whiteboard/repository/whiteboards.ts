import { execProc } from "@/lib/db";
import {
  savedWhiteboardSchema,
  whiteboardRowSchema,
  whiteboardSummarySchema,
  type CreateWhiteboardInput,
  type DeleteWhiteboardInput,
  type RenameWhiteboardInput,
  type SavedWhiteboard,
  type SaveWhiteboardInput,
  type WhiteboardRow,
  type WhiteboardSummary,
} from "../schemas/whiteboard";

/** Every proc takes its project from the row and checks access itself. */

export async function listWhiteboards(
  projectId: number,
  actorUserId: number,
): Promise<WhiteboardSummary[]> {
  const rows = await execProc("usp_Whiteboard_List", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  return rows.map((row) => whiteboardSummarySchema.parse(row));
}

export async function getWhiteboard(
  whiteboardId: number,
  actorUserId: number,
): Promise<WhiteboardRow> {
  const rows = await execProc("usp_Whiteboard_GetById", {
    WhiteboardId: whiteboardId,
    ActorUserId: actorUserId,
  });
  return whiteboardRowSchema.parse(rows[0]);
}

export async function createWhiteboard(
  input: CreateWhiteboardInput,
  actorUserId: number,
): Promise<WhiteboardSummary> {
  const rows = await execProc("usp_Whiteboard_Create", {
    ProjectId: input.projectId,
    Name: input.name,
    ActorUserId: actorUserId,
  });
  return whiteboardSummarySchema.parse(rows[0]);
}

export async function renameWhiteboard(
  input: RenameWhiteboardInput,
  actorUserId: number,
): Promise<WhiteboardSummary> {
  const rows = await execProc("usp_Whiteboard_Rename", {
    WhiteboardId: input.whiteboardId,
    Name: input.name,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return whiteboardSummarySchema.parse(rows[0]);
}

export async function saveWhiteboard(
  input: SaveWhiteboardInput,
  actorUserId: number,
): Promise<SavedWhiteboard> {
  const rows = await execProc("usp_Whiteboard_Update", {
    WhiteboardId: input.whiteboardId,
    BoardJson: JSON.stringify(input.board),
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return savedWhiteboardSchema.parse(rows[0]);
}

export async function deleteWhiteboard(
  input: DeleteWhiteboardInput,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_Whiteboard_Delete", {
    WhiteboardId: input.whiteboardId,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
}
