"use server";

import { action } from "@/lib/action";
import {
  clearColumnLabel,
  createChoice,
  createRegisterColumn,
  deleteChoice,
  deleteRegisterColumn,
  moveRegisterColumn,
  renameChoice,
  renameRegisterColumn,
  setColumnLabel,
  setRegisterCell,
  setRegisterColumnKind,
} from "../repository/register-columns";
import {
  clearLabelInput,
  createChoiceInput,
  createRegisterColumnInput,
  deleteChoiceInput,
  deleteRegisterColumnInput,
  moveRegisterColumnInput,
  renameChoiceInput,
  renameRegisterColumnInput,
  setLabelInput,
  setRegisterCellInput,
  setRegisterColumnKindInput,
} from "../schemas/register-columns";

/**
 * The register's column names and added columns (ADR-0067). Level, overrides and audit are the
 * procs'. A cell write answers with the requirement's new version, which the datasheet merges;
 * column changes refresh the register.
 */
const PAGE = ["/projects/[id]/requirements"];

export const setColumnLabelAction = action({
  name: "requirements.label.set",
  schema: setLabelInput,
  permission: "requirements:update",
  revalidate: PAGE,
  handler: (input, ctx) => setColumnLabel(input, ctx.session.userId),
});

export const clearColumnLabelAction = action({
  name: "requirements.label.clear",
  schema: clearLabelInput,
  permission: "requirements:update",
  revalidate: PAGE,
  handler: (input, ctx) => clearColumnLabel(input, ctx.session.userId),
});

export const createRegisterColumnAction = action({
  name: "requirements.column.create",
  schema: createRegisterColumnInput,
  permission: "requirements:create",
  revalidate: PAGE,
  handler: (input, ctx) => createRegisterColumn(input, ctx.session.userId),
});

export const renameRegisterColumnAction = action({
  name: "requirements.column.rename",
  schema: renameRegisterColumnInput,
  permission: "requirements:update",
  revalidate: PAGE,
  handler: (input, ctx) => renameRegisterColumn(input, ctx.session.userId),
});

export const moveRegisterColumnAction = action({
  name: "requirements.column.move",
  schema: moveRegisterColumnInput,
  permission: "requirements:update",
  revalidate: PAGE,
  handler: (input, ctx) => moveRegisterColumn(input, ctx.session.userId),
});

export const setRegisterColumnKindAction = action({
  name: "requirements.column.kind",
  schema: setRegisterColumnKindInput,
  permission: "requirements:update",
  revalidate: PAGE,
  handler: (input, ctx) => setRegisterColumnKind(input, ctx.session.userId),
});

export const deleteRegisterColumnAction = action({
  name: "requirements.column.delete",
  schema: deleteRegisterColumnInput,
  permission: "requirements:delete",
  revalidate: PAGE,
  handler: (input, ctx) => deleteRegisterColumn(input, ctx.session.userId),
});

export const createChoiceAction = action({
  name: "requirements.choice.create",
  schema: createChoiceInput,
  permission: "requirements:create",
  revalidate: PAGE,
  handler: (input, ctx) => createChoice(input, ctx.session.userId),
});

export const renameChoiceAction = action({
  name: "requirements.choice.rename",
  schema: renameChoiceInput,
  permission: "requirements:update",
  revalidate: PAGE,
  handler: (input, ctx) => renameChoice(input, ctx.session.userId),
});

export const deleteChoiceAction = action({
  name: "requirements.choice.delete",
  schema: deleteChoiceInput,
  permission: "requirements:delete",
  revalidate: PAGE,
  handler: (input, ctx) => deleteChoice(input, ctx.session.userId),
});

export const setRegisterCellAction = action({
  name: "requirements.cell.set",
  schema: setRegisterCellInput,
  permission: "requirements:update",
  handler: (input, ctx) => setRegisterCell(input, ctx.session.userId),
});
