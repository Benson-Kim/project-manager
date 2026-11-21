import { action } from "@/lib/action";
import {
  createChoiceInput,
  createRegisterColumnInput,
  deleteChoiceInput,
  deleteRegisterColumnInput,
  labelInputsFor,
  moveRegisterColumnInput,
  renameChoiceInput,
  renameRegisterColumnInput,
  setRegisterCellInput,
  setRegisterColumnKindInput,
  type BuiltInColumn,
  type CustomColumnEntity,
} from "./register";
import { customColumnRepository } from "./repository";

/**
 * The server actions behind one list's column names and added columns. The resource names the
 * permissions (`<resource>:create|update|delete`); level, overrides and audit are the procs'. A cell
 * write answers with the row's new version, which the list merges; column changes refresh the page.
 */
export function customColumnActions<const T extends readonly BuiltInColumn[]>(config: {
  entity: CustomColumnEntity;
  builtIns: T;
  resource: string;
  page: string[];
}) {
  const repo = customColumnRepository(config.entity, config.builtIns);
  const labels = labelInputsFor(config.builtIns);
  const { resource, page } = config;
  const create = `${resource}:create` as const;
  const update = `${resource}:update` as const;
  const remove = `${resource}:delete` as const;

  return {
    setLabel: action({
      name: `${resource}.label.set`,
      schema: labels.set,
      permission: update,
      revalidate: page,
      handler: (input, ctx) => repo.setLabel(input, ctx.session.userId),
    }),
    clearLabel: action({
      name: `${resource}.label.clear`,
      schema: labels.clear,
      permission: update,
      revalidate: page,
      handler: (input, ctx) => repo.clearLabel(input, ctx.session.userId),
    }),
    createColumn: action({
      name: `${resource}.column.create`,
      schema: createRegisterColumnInput,
      permission: create,
      revalidate: page,
      handler: (input, ctx) => repo.createColumn(input, ctx.session.userId),
    }),
    renameColumn: action({
      name: `${resource}.column.rename`,
      schema: renameRegisterColumnInput,
      permission: update,
      revalidate: page,
      handler: (input, ctx) => repo.renameColumn(input, ctx.session.userId),
    }),
    moveColumn: action({
      name: `${resource}.column.move`,
      schema: moveRegisterColumnInput,
      permission: update,
      revalidate: page,
      handler: (input, ctx) => repo.moveColumn(input, ctx.session.userId),
    }),
    setColumnKind: action({
      name: `${resource}.column.kind`,
      schema: setRegisterColumnKindInput,
      permission: update,
      revalidate: page,
      handler: (input, ctx) => repo.setColumnKind(input, ctx.session.userId),
    }),
    deleteColumn: action({
      name: `${resource}.column.delete`,
      schema: deleteRegisterColumnInput,
      permission: remove,
      revalidate: page,
      handler: (input, ctx) => repo.deleteColumn(input, ctx.session.userId),
    }),
    createChoice: action({
      name: `${resource}.choice.create`,
      schema: createChoiceInput,
      permission: create,
      revalidate: page,
      handler: (input, ctx) => repo.createChoice(input, ctx.session.userId),
    }),
    renameChoice: action({
      name: `${resource}.choice.rename`,
      schema: renameChoiceInput,
      permission: update,
      revalidate: page,
      handler: (input, ctx) => repo.renameChoice(input, ctx.session.userId),
    }),
    deleteChoice: action({
      name: `${resource}.choice.delete`,
      schema: deleteChoiceInput,
      permission: remove,
      revalidate: page,
      handler: (input, ctx) => repo.deleteChoice(input, ctx.session.userId),
    }),
    setCell: action({
      name: `${resource}.cell.set`,
      schema: setRegisterCellInput,
      permission: update,
      handler: (input, ctx) => repo.setCell(input, ctx.session.userId),
    }),
  };
}
