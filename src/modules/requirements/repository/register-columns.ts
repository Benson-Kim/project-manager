import { execProc } from "@/lib/db";
import {
  BUILT_IN_COLUMNS_JSON,
  columnLabelSchema,
  registerCellResultSchema,
  registerColumnSchema,
  type ClearLabelInput,
  type ColumnLabel,
  type CreateChoiceInput,
  type CreateRegisterColumnInput,
  type DeleteChoiceInput,
  type DeleteRegisterColumnInput,
  type MoveRegisterColumnInput,
  type RegisterCellResult,
  type RegisterColumn,
  type RenameChoiceInput,
  type RenameRegisterColumnInput,
  type SetLabelInput,
  type SetRegisterCellParsed,
  type SetRegisterColumnKindInput,
} from "../schemas/register-columns";

/**
 * The register's column names and added columns (ADR-0067). Every proc checks access and the
 * per-person overrides itself and audits. The built-in columns' keys and default names go to the
 * procs from the app's one list, so a name is checked against every column the register shows.
 */

const choicesJson = (kind: string, choices: readonly string[] | undefined) =>
  kind === "choice" ? JSON.stringify(choices ?? []) : null;

export async function listColumnLabels(
  projectId: number,
  actorUserId: number,
): Promise<ColumnLabel[]> {
  const rows = await execProc("usp_RequirementLabel_List", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  return rows.map((row) => columnLabelSchema.parse(row));
}

export async function setColumnLabel(
  input: SetLabelInput,
  actorUserId: number,
): Promise<ColumnLabel> {
  const rows = await execProc("usp_RequirementLabel_Set", {
    ProjectId: input.projectId,
    ColumnKey: input.columnKey,
    Label: input.label,
    RowVer: input.rowVer,
    BuiltInJson: BUILT_IN_COLUMNS_JSON,
    ActorUserId: actorUserId,
  });
  return columnLabelSchema.parse(rows[0]);
}

export async function clearColumnLabel(input: ClearLabelInput, actorUserId: number): Promise<void> {
  await execProc("usp_RequirementLabel_Clear", {
    ProjectId: input.projectId,
    ColumnKey: input.columnKey,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
}

export async function listRegisterColumns(
  projectId: number,
  actorUserId: number,
): Promise<RegisterColumn[]> {
  const rows = await execProc("usp_RequirementColumn_List", {
    ProjectId: projectId,
    ActorUserId: actorUserId,
  });
  return rows.map((row) => registerColumnSchema.parse(row));
}

export async function createRegisterColumn(
  input: CreateRegisterColumnInput,
  actorUserId: number,
): Promise<RegisterColumn> {
  const rows = await execProc("usp_RequirementColumn_Create", {
    ProjectId: input.projectId,
    Name: input.name,
    Kind: input.kind,
    OptionsJson: choicesJson(input.kind, input.choices),
    BuiltInJson: BUILT_IN_COLUMNS_JSON,
    ActorUserId: actorUserId,
  });
  return registerColumnSchema.parse(rows[0]);
}

export async function renameRegisterColumn(
  input: RenameRegisterColumnInput,
  actorUserId: number,
): Promise<RegisterColumn> {
  const rows = await execProc("usp_RequirementColumn_Rename", {
    RequirementColumnId: input.columnId,
    Name: input.name,
    RowVer: input.rowVer,
    BuiltInJson: BUILT_IN_COLUMNS_JSON,
    ActorUserId: actorUserId,
  });
  return registerColumnSchema.parse(rows[0]);
}

export async function moveRegisterColumn(
  input: MoveRegisterColumnInput,
  actorUserId: number,
): Promise<RegisterColumn[]> {
  const rows = await execProc("usp_RequirementColumn_Move", {
    RequirementColumnId: input.columnId,
    Direction: input.direction,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return rows.map((row) => registerColumnSchema.parse(row));
}

export async function setRegisterColumnKind(
  input: SetRegisterColumnKindInput,
  actorUserId: number,
): Promise<RegisterColumn> {
  const rows = await execProc("usp_RequirementColumn_SetKind", {
    RequirementColumnId: input.columnId,
    Kind: input.kind,
    OptionsJson: choicesJson(input.kind, input.choices),
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return registerColumnSchema.parse(rows[0]);
}

export async function deleteRegisterColumn(
  input: DeleteRegisterColumnInput,
  actorUserId: number,
): Promise<void> {
  await execProc("usp_RequirementColumn_Delete", {
    RequirementColumnId: input.columnId,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
}

export async function createChoice(input: CreateChoiceInput, actorUserId: number): Promise<void> {
  await execProc("usp_RequirementColumnOption_Create", {
    RequirementColumnId: input.columnId,
    Label: input.label,
    ActorUserId: actorUserId,
  });
}

export async function renameChoice(input: RenameChoiceInput, actorUserId: number): Promise<void> {
  await execProc("usp_RequirementColumnOption_Rename", {
    RequirementColumnOptionId: input.optionId,
    Label: input.label,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
}

export async function deleteChoice(input: DeleteChoiceInput, actorUserId: number): Promise<void> {
  await execProc("usp_RequirementColumnOption_Delete", {
    RequirementColumnOptionId: input.optionId,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
}

export async function setRegisterCell(
  input: SetRegisterCellParsed,
  actorUserId: number,
): Promise<RegisterCellResult> {
  const rows = await execProc("usp_RequirementCell_Set", {
    RequirementId: input.requirementId,
    RequirementColumnId: input.columnId,
    Value: input.value,
    RowVer: input.rowVer,
    ActorUserId: actorUserId,
  });
  return registerCellResultSchema.parse(rows[0]);
}
