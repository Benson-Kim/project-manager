import { columnSchemaFor, labelInputsFor } from "@/lib/custom-columns/register";
import { messages } from "@/lib/messages";

export {
  MAX_CHOICES,
  MAX_REGISTER_COLUMNS,
  columnLabelSchema,
  createChoiceInput,
  createRegisterColumnInput,
  deleteChoiceInput,
  deleteRegisterColumnInput,
  moveRegisterColumnInput,
  registerCellResultSchema,
  registerCellsSchema,
  renameChoiceInput,
  renameRegisterColumnInput,
  setRegisterCellInput,
  setRegisterColumnKindInput,
  type ClearLabelInput,
  type ColumnLabel,
  type CreateChoiceInput,
  type CreateRegisterColumnInput,
  type DeleteChoiceInput,
  type DeleteRegisterColumnInput,
  type MoveRegisterColumnInput,
  type RegisterCell,
  type RegisterCellResult,
  type RegisterColumn,
  type RegisterOption,
  type RenameChoiceInput,
  type RenameRegisterColumnInput,
  type SetLabelInput,
  type SetRegisterCellInput,
  type SetRegisterCellParsed,
  type SetRegisterColumnKindInput,
} from "@/lib/custom-columns/register";

/**
 * The requirement register's own column names and added columns, per project (ADR-0067). A
 * built-in column is named by its stable key; a rename writes only a label, never the key, so data,
 * filters, sorting, saved views and exports keep working.
 */

const M = messages.requirements;

/** The register's built-in columns: stable key and default name. One list for the view and the procs. */
export const REGISTER_BUILT_IN_COLUMNS = [
  { key: "Ref", name: M.ref },
  { key: "RequirementType", name: M.type },
  { key: "Requirement", name: M.requirement },
  { key: "IsMet", name: M.met },
  { key: "Deliverables", name: M.deliverables },
  { key: "Validates", name: M.validates },
  { key: "ValidatedBy", name: M.validatedBy },
  { key: "Coverage", name: M.coverage },
  { key: "CreatedAtUtc", name: M.addedAt },
  { key: "AddSub", name: M.addSubRequirement },
] as const;

export type BuiltInColumnKey = (typeof REGISTER_BUILT_IN_COLUMNS)[number]["key"];

export const { set: setLabelInput, clear: clearLabelInput } =
  labelInputsFor(REGISTER_BUILT_IN_COLUMNS);

export const registerColumnSchema = columnSchemaFor("Requirement");

export function parseChoiceFilter(
  value: string | undefined,
): { columnId: number; optionId: number } | null {
  const match = /^(\d{1,9})\.(\d{1,9})$/.exec(value ?? "");
  return match ? { columnId: Number(match[1]), optionId: Number(match[2]) } : null;
}

export const choiceFilterParam = (columnId: number, optionId: number) => `${columnId}.${optionId}`;
