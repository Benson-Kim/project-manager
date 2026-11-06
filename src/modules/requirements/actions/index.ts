"use server";

import { action } from "@/lib/action";
import {
  addCanvasNode,
  allocateRequirement,
  createCanvas,
  deleteCanvas,
  moveCanvasNodes,
  removeCanvasNode,
  updateCanvas,
} from "../repository/canvases";
import {
  createRequirement,
  createRequirementLink,
  deleteRequirement,
  deleteRequirementLink,
  readRequirementDeleteImpact,
  setLinkRule,
  setRequirementMoscow,
  setRequirementPlanning,
  unallocateRequirement,
  updateRequirement,
  updateRequirementLink,
} from "../repository/requirements";
import {
  createRequirementFormSchema,
  updateRequirementFormSchema,
} from "../schemas/requirement-form";
import {
  addCanvasNodeInput,
  allocateRequirementInput,
  createCanvasInput,
  deleteCanvasInput,
  moveCanvasNodesInput,
  removeCanvasNodeInput,
  unallocateRequirementInput,
  updateCanvasInput,
} from "../schemas/canvas";
import { setLinkRuleInput } from "../schemas/link-rules";
import { deleteRequirementInput, requirementDeleteImpactInput } from "../schemas/requirement";
import {
  createRequirementLinkInput,
  deleteRequirementLinkInput,
  updateRequirementLinkInput,
} from "../schemas/requirement-link";
import { setMoscowInput, setPlanningInput } from "../schemas/requirement-planning";

/**
 * Requirement register mutations (ADR-0037). Project level is checked in-proc (ADR-0021); the
 * procs write the audit row in-transaction. A change shows in the register, in the work breakdown
 * and Gantt, and on any board card that carries the requirement or its deliverable, so every one
 * revalidates all of them.
 */
const REVALIDATE_TARGETS = [
  "/projects/[id]/requirements",
  "/projects/[id]/deliverables",
  "/projects/[id]/deliverables/gantt",
  "/projects/[id]/deliverables/canvas",
  "/boards/[boardId]",
  "/projects/[id]/boards/[boardId]",
];

const CANVAS_TARGETS = ["/projects/[id]/deliverables/canvas"];

export const createRequirementAction = action({
  name: "requirements.create",
  schema: createRequirementFormSchema,
  permission: "requirements:create",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => createRequirement(input, ctx.session.userId),
});

export const updateRequirementAction = action({
  name: "requirements.update",
  schema: updateRequirementFormSchema,
  permission: "requirements:update",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => updateRequirement(input, ctx.session.userId),
});

/** Read before the delete dialog asks: the same permission as the delete it describes. */
export const requirementDeleteImpactAction = action({
  name: "requirements.deleteImpact",
  schema: requirementDeleteImpactInput,
  permission: "requirements:delete",
  handler: (input, ctx) => readRequirementDeleteImpact(input.requirementId, ctx.session.userId),
});

export const deleteRequirementAction = action({
  name: "requirements.delete",
  schema: deleteRequirementInput,
  permission: "requirements:delete",
  revalidate: REVALIDATE_TARGETS,
  handler: async (input, ctx) => {
    await deleteRequirement(input, ctx.session.userId);
    return { requirementId: input.requirementId };
  },
});

/**
 * Settings > Link rules. The gate is `admin:link-rules`, which can() refuses to a User, and the
 * proc checks the Admin role again. Open registers read the rules, so they revalidate too.
 */
export const setLinkRuleAction = action({
  name: "requirements.setLinkRule",
  schema: setLinkRuleInput,
  permission: "admin:link-rules",
  revalidate: ["/settings/link-rules", "/projects/[id]/requirements"],
  handler: (input, ctx) => setLinkRule(input, ctx.session.userId),
});

export const createRequirementLinkAction = action({
  name: "requirements.createLink",
  schema: createRequirementLinkInput,
  permission: "requirements:update",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => createRequirementLink(input, ctx.session.userId),
});

export const updateRequirementLinkAction = action({
  name: "requirements.updateLink",
  schema: updateRequirementLinkInput,
  permission: "requirements:update",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => updateRequirementLink(input, ctx.session.userId),
});

export const deleteRequirementLinkAction = action({
  name: "requirements.deleteLink",
  schema: deleteRequirementLinkInput,
  permission: "requirements:update",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => deleteRequirementLink(input, ctx.session.userId),
});

export const setRequirementMoscowAction = action({
  name: "requirements.setMoscow",
  schema: setMoscowInput,
  permission: "requirements:update",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => setRequirementMoscow(input, ctx.session.userId),
});

export const setRequirementPlanningAction = action({
  name: "requirements.setPlanning",
  schema: setPlanningInput,
  permission: "requirements:update",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => setRequirementPlanning(input, ctx.session.userId),
});

export const createCanvasAction = action({
  name: "requirements.createCanvas",
  schema: createCanvasInput,
  permission: "requirements:create",
  revalidate: CANVAS_TARGETS,
  handler: (input, ctx) => createCanvas(input, ctx.session.userId),
});

export const updateCanvasAction = action({
  name: "requirements.updateCanvas",
  schema: updateCanvasInput,
  permission: "requirements:update",
  revalidate: CANVAS_TARGETS,
  handler: (input, ctx) => updateCanvas(input, ctx.session.userId),
});

export const deleteCanvasAction = action({
  name: "requirements.deleteCanvas",
  schema: deleteCanvasInput,
  permission: "requirements:delete",
  revalidate: CANVAS_TARGETS,
  handler: (input, ctx) => deleteCanvas(input, ctx.session.userId),
});

/**
 * Node writes change a view, so `requirements:update`, and take no revalidate: the board keeps
 * its own overlay, and a whole-project read per drag is what ADR-0061 section 3 avoids.
 */
export const addCanvasNodeAction = action({
  name: "requirements.addCanvasNode",
  schema: addCanvasNodeInput,
  permission: "requirements:update",
  handler: (input, ctx) => addCanvasNode(input, ctx.session.userId),
});

export const moveCanvasNodesAction = action({
  name: "requirements.moveCanvasNodes",
  schema: moveCanvasNodesInput,
  permission: "requirements:update",
  handler: (input, ctx) => moveCanvasNodes(input, ctx.session.userId),
});

export const removeCanvasNodeAction = action({
  name: "requirements.removeCanvasNode",
  schema: removeCanvasNodeInput,
  permission: "requirements:update",
  handler: (input, ctx) => removeCanvasNode(input, ctx.session.userId),
});

export const allocateRequirementAction = action({
  name: "requirements.allocate",
  schema: allocateRequirementInput,
  permission: "requirements:update",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => allocateRequirement(input, ctx.session.userId),
});

export const unallocateRequirementAction = action({
  name: "requirements.unallocate",
  schema: unallocateRequirementInput,
  permission: "requirements:update",
  revalidate: REVALIDATE_TARGETS,
  handler: (input, ctx) => unallocateRequirement(input, ctx.session.userId),
});
