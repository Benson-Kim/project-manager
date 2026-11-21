import { execProc } from "@/lib/db";
import {
  CUSTOM_COLUMN_ENTITIES,
  columnLabelSchema,
  columnSchemaFor,
  registerCellResultSchema,
  type BuiltInColumn,
  type ClearLabelInput,
  type ColumnLabel,
  type CreateChoiceInput,
  type CreateRegisterColumnInput,
  type CustomColumnEntity,
  type DeleteChoiceInput,
  type DeleteRegisterColumnInput,
  type MoveRegisterColumnInput,
  type RegisterColumn,
  type RegisterCellResult,
  type RenameChoiceInput,
  type RenameRegisterColumnInput,
  type SetLabelInput,
  type SetRegisterCellParsed,
  type SetRegisterColumnKindInput,
} from "./register";

const choicesJson = (kind: string, choices: readonly string[] | undefined) =>
  kind === "choice" ? JSON.stringify(choices ?? []) : null;

export function customColumnRepository(
  entity: CustomColumnEntity,
  builtIns: readonly BuiltInColumn[],
) {
  if (!CUSTOM_COLUMN_ENTITIES.includes(entity)) throw new Error("Unknown list");
  const builtInJson = JSON.stringify(builtIns);
  const columnSchema = columnSchemaFor(entity);
  const columnKey = `${entity}ColumnId`;
  const optionKey = `${entity}ColumnOptionId`;
  const run = (proc: string, params: Parameters<typeof execProc>[1]) =>
    execProc(`usp_${entity}${proc}`, params);
  const columns = (rows: unknown[]) => rows.map((row) => columnSchema.parse(row));

  return {
    async listLabels(projectId: number, actorUserId: number): Promise<ColumnLabel[]> {
      const rows = await run("Label_List", { ProjectId: projectId, ActorUserId: actorUserId });
      return rows.map((row) => columnLabelSchema.parse(row));
    },
    async setLabel(input: SetLabelInput, actorUserId: number): Promise<ColumnLabel> {
      const rows = await run("Label_Set", {
        ProjectId: input.projectId,
        ColumnKey: input.columnKey,
        Label: input.label,
        RowVer: input.rowVer,
        BuiltInJson: builtInJson,
        ActorUserId: actorUserId,
      });
      return columnLabelSchema.parse(rows[0]);
    },
    async clearLabel(input: ClearLabelInput, actorUserId: number): Promise<void> {
      await run("Label_Clear", {
        ProjectId: input.projectId,
        ColumnKey: input.columnKey,
        RowVer: input.rowVer,
        ActorUserId: actorUserId,
      });
    },
    async listColumns(projectId: number, actorUserId: number): Promise<RegisterColumn[]> {
      return columns(await run("Column_List", { ProjectId: projectId, ActorUserId: actorUserId }));
    },
    async createColumn(input: CreateRegisterColumnInput, actorUserId: number) {
      const rows = await run("Column_Create", {
        ProjectId: input.projectId,
        Name: input.name,
        Kind: input.kind,
        OptionsJson: choicesJson(input.kind, input.choices),
        BuiltInJson: builtInJson,
        ActorUserId: actorUserId,
      });
      return columns(rows)[0]!;
    },
    async renameColumn(input: RenameRegisterColumnInput, actorUserId: number) {
      const rows = await run("Column_Rename", {
        [columnKey]: input.columnId,
        Name: input.name,
        RowVer: input.rowVer,
        BuiltInJson: builtInJson,
        ActorUserId: actorUserId,
      });
      return columns(rows)[0]!;
    },
    async moveColumn(input: MoveRegisterColumnInput, actorUserId: number) {
      return columns(
        await run("Column_Move", {
          [columnKey]: input.columnId,
          Direction: input.direction,
          RowVer: input.rowVer,
          ActorUserId: actorUserId,
        }),
      );
    },
    async setColumnKind(input: SetRegisterColumnKindInput, actorUserId: number) {
      const rows = await run("Column_SetKind", {
        [columnKey]: input.columnId,
        Kind: input.kind,
        OptionsJson: choicesJson(input.kind, input.choices),
        RowVer: input.rowVer,
        ActorUserId: actorUserId,
      });
      return columns(rows)[0]!;
    },
    async deleteColumn(input: DeleteRegisterColumnInput, actorUserId: number): Promise<void> {
      await run("Column_Delete", {
        [columnKey]: input.columnId,
        RowVer: input.rowVer,
        ActorUserId: actorUserId,
      });
    },
    async createChoice(input: CreateChoiceInput, actorUserId: number): Promise<void> {
      await run("ColumnOption_Create", {
        [columnKey]: input.columnId,
        Label: input.label,
        ActorUserId: actorUserId,
      });
    },
    async renameChoice(input: RenameChoiceInput, actorUserId: number): Promise<void> {
      await run("ColumnOption_Rename", {
        [optionKey]: input.optionId,
        Label: input.label,
        RowVer: input.rowVer,
        ActorUserId: actorUserId,
      });
    },
    async deleteChoice(input: DeleteChoiceInput, actorUserId: number): Promise<void> {
      await run("ColumnOption_Delete", {
        [optionKey]: input.optionId,
        RowVer: input.rowVer,
        ActorUserId: actorUserId,
      });
    },
    async setCell(input: SetRegisterCellParsed, actorUserId: number): Promise<RegisterCellResult> {
      const rows = await run("Cell_Set", {
        [`${entity}Id`]: input.rowId,
        [columnKey]: input.columnId,
        Value: input.value,
        RowVer: input.rowVer,
        ActorUserId: actorUserId,
      });
      return registerCellResultSchema.parse(rows[0]);
    },
  };
}
export type CustomColumnRepository = ReturnType<typeof customColumnRepository>;
