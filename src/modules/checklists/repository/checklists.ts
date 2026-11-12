import { execProc } from "@/lib/db";
import { DEFAULT_PAGE_SIZE, toProcListParams, type ListParams } from "@/lib/list-params";
import {
  checklistColumnSchema,
  checklistItemListRowSchema,
  checklistItemSchema,
  checklistSchema,
  type Checklist,
  type ChecklistColumn,
  type ChecklistItem,
  type ChecklistItemListRow,
  type CreateChecklistInput,
  type CreateColumnParsed,
  type CreateItemInput,
  type DeleteChecklistInput,
  type DeleteColumnInput,
  type DeleteItemInput,
  type MoveColumnInput,
  type RenameChecklistInput,
  type RenameColumnInput,
  type RunTodoInput,
  type SetCellParsed,
  type SetItemDoneInput,
  type UpdateItemInput,
} from "../schemas/checklist";

/**
 * Checklists (ADR-0066). Every proc takes its project from the row it touches and checks access
 * and the per-person overrides itself (ADR-0021, ADR-0024), and writes the audit row.
 */

const parseItem = (rows: unknown[]): ChecklistItem => checklistItemSchema.parse(rows[0]);
const parseColumns = (rows: unknown[]): ChecklistColumn[] =>
  rows.map((row) => checklistColumnSchema.parse(row));

export async function listChecklists(projectId: number, actorUserId: number): Promise<Checklist[]> {
  const rows = await execProc("usp_Checklist_List", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  return rows.map((row) => checklistSchema.parse(row));
}

export async function createChecklist(
  input: CreateChecklistInput,
  actorUserId: number,
): Promise<Checklist> {
  const rows = await execProc("usp_Checklist_Create", {
    ProjectId: input.projectId,
    Name: input.name,
    ActorUserId: actorUserId,
  });
  return checklistSchema.parse(rows[0]);
}

export async function renameChecklist(
  input: RenameChecklistInput,
  actorUserId: number,
): Promise<Checklist> {
  const rows = await execProc("usp_Checklist_Rename", {
    ChecklistId: input.checklistId,
    Name: input.name,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return checklistSchema.parse(rows[0]);
}

export async function deleteChecklist(
  input: DeleteChecklistInput,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_Checklist_Delete", {
    ChecklistId: input.checklistId,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
}

export async function listColumns(
  checklistId: number,
  actorUserId: number,
): Promise<ChecklistColumn[]> {
  return parseColumns(
    await execProc("usp_ChecklistColumn_List", {
      ChecklistId: checklistId,
      ActorUserId: actorUserId,
    }),
  );
}

export async function createColumn(
  input: CreateColumnParsed,
  actorUserId: number,
): Promise<ChecklistColumn> {
  const rows = await execProc("usp_ChecklistColumn_Create", {
    ChecklistId: input.checklistId,
    Name: input.name,
    Kind: input.kind,
    ActionKind: input.actionKind ?? null,
    ActorUserId: actorUserId,
  });
  return checklistColumnSchema.parse(rows[0]);
}

export async function renameColumn(
  input: RenameColumnInput,
  actorUserId: number,
): Promise<ChecklistColumn> {
  const rows = await execProc("usp_ChecklistColumn_Rename", {
    ChecklistColumnId: input.columnId,
    Name: input.name,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return checklistColumnSchema.parse(rows[0]);
}

/** Answers with every column of the checklist in the new order. */
export async function moveColumn(
  input: MoveColumnInput,
  actorUserId: number,
): Promise<ChecklistColumn[]> {
  return parseColumns(
    await execProc("usp_ChecklistColumn_Move", {
      ChecklistColumnId: input.columnId,
      Direction: input.direction,
      RowVer: input.rowVer,
      ActorUserId: actorUserId,
    }),
  );
}

export async function deleteColumn(input: DeleteColumnInput, actorUserId: number): Promise<void> {
  await execProc("usp_ChecklistColumn_Delete", {
    ChecklistColumnId: input.columnId,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
}

export async function listItems(
  checklistId: number,
  params: ListParams,
  actorUserId: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): Promise<ChecklistItemListRow[]> {
  const rows = await execProc("usp_ChecklistItem_List", {
    ChecklistId: checklistId,
    ActorUserId: actorUserId,
    ...toProcListParams(params, pageSize),
  });
  return rows.map((row) => checklistItemListRowSchema.parse(row));
}

export async function createItem(
  input: CreateItemInput,
  actorUserId: number,
): Promise<ChecklistItem> {
  return parseItem(
    await execProc("usp_ChecklistItem_Create", {
      ChecklistId: input.checklistId,
      Title: input.title,
      ActorUserId: actorUserId,
    }),
  );
}

export async function updateItem(
  input: UpdateItemInput,
  actorUserId: number,
): Promise<ChecklistItem> {
  return parseItem(
    await execProc("usp_ChecklistItem_Update", {
      ChecklistItemId: input.itemId,
      Title: input.title,
      RowVer: input.rowVer,
      ActorUserId: actorUserId,
    }),
  );
}

export async function setItemDone(
  input: SetItemDoneInput,
  actorUserId: number,
): Promise<ChecklistItem> {
  return parseItem(
    await execProc("usp_ChecklistItem_SetStatus", {
      ChecklistItemId: input.itemId,
      IsDone: input.done,
      RowVer: input.rowVer,
      ActorUserId: actorUserId,
    }),
  );
}

export async function deleteItem(input: DeleteItemInput, actorUserId: number): Promise<void> {
  await execProc("usp_ChecklistItem_Delete", {
    ChecklistItemId: input.itemId,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
}

export async function setCell(input: SetCellParsed, actorUserId: number): Promise<ChecklistItem> {
  return parseItem(
    await execProc("usp_ChecklistCell_Set", {
      ChecklistItemId: input.itemId,
      ChecklistColumnId: input.columnId,
      Value: input.value,
      RowVer: input.rowVer,
      ActorUserId: actorUserId,
    }),
  );
}

/** The to-do button: makes the row's to-do, or finds the one it already made. */
export async function runTodo(input: RunTodoInput, actorUserId: number): Promise<ChecklistItem> {
  return parseItem(
    await execProc("usp_Todo_BuildFromChecklist", {
      ChecklistItemId: input.itemId,
      ChecklistColumnId: input.columnId,
      ActorUserId: actorUserId,
    }),
  );
}
