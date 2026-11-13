"use server";

import { action } from "@/lib/action";
import {
  addResponsibilityMember,
  createResponsibilityMatrix,
  deleteResponsibilityMatrix,
  listResponsibilityCells,
  listResponsibilityMatrices,
  moveResponsibilityMember,
  removeResponsibilityMember,
  renameResponsibilityMatrix,
  setResponsibilityCell,
  setResponsibilityCells,
} from "../repository/responsibility";
import {
  createMatrixInput,
  deleteMatrixInput,
  matrixInput,
  memberInput,
  moveMemberInput,
  projectInput,
  renameMatrixInput,
  setCellInput,
  setCellsInput,
} from "../schemas/responsibility-matrix";

const READ = "stakeholders:read" as const;
const UPDATE = "stakeholders:update" as const;

export const listResponsibilityMatricesAction = action({
  name: "responsibility.listMatrices",
  schema: projectInput,
  permission: READ,
  revalidate: [],
  handler: (input, ctx) => listResponsibilityMatrices(input.projectId, ctx.session.userId),
});

export const createResponsibilityMatrixAction = action({
  name: "responsibility.createMatrix",
  schema: createMatrixInput,
  permission: "stakeholders:create",
  revalidate: [],
  handler: (input, ctx) => createResponsibilityMatrix(input, ctx.session.userId),
});

export const renameResponsibilityMatrixAction = action({
  name: "responsibility.renameMatrix",
  schema: renameMatrixInput,
  permission: UPDATE,
  revalidate: [],
  handler: (input, ctx) => renameResponsibilityMatrix(input, ctx.session.userId),
});

export const deleteResponsibilityMatrixAction = action({
  name: "responsibility.deleteMatrix",
  schema: deleteMatrixInput,
  permission: "stakeholders:delete",
  revalidate: [],
  handler: (input, ctx) => deleteResponsibilityMatrix(input, ctx.session.userId),
});

export const addResponsibilityMemberAction = action({
  name: "responsibility.addMember",
  schema: memberInput,
  permission: UPDATE,
  revalidate: [],
  handler: (input, ctx) => addResponsibilityMember(input, ctx.session.userId),
});

export const removeResponsibilityMemberAction = action({
  name: "responsibility.removeMember",
  schema: memberInput,
  permission: UPDATE,
  revalidate: [],
  handler: (input, ctx) => removeResponsibilityMember(input, ctx.session.userId),
});

export const moveResponsibilityMemberAction = action({
  name: "responsibility.moveMember",
  schema: moveMemberInput,
  permission: UPDATE,
  revalidate: [],
  handler: (input, ctx) => moveResponsibilityMember(input, ctx.session.userId),
});

export const listResponsibilityCellsAction = action({
  name: "responsibility.listCells",
  schema: matrixInput,
  permission: READ,
  revalidate: [],
  handler: (input, ctx) => listResponsibilityCells(input, ctx.session.userId),
});

export const setResponsibilityCellAction = action({
  name: "responsibility.setCell",
  schema: setCellInput,
  permission: UPDATE,
  revalidate: [],
  handler: (input, ctx) => setResponsibilityCell(input, ctx.session.userId),
});

export const setResponsibilityCellsAction = action({
  name: "responsibility.setCells",
  schema: setCellsInput,
  permission: UPDATE,
  revalidate: [],
  handler: (input, ctx) => setResponsibilityCells(input, ctx.session.userId),
});
