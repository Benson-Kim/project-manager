"use server";

import { action } from "@/lib/action";
import { createDiagram, deleteDiagram, renameDiagram, saveDiagram } from "../repository/diagrams";
import {
  createDiagramInput,
  deleteDiagramInput,
  renameDiagramInput,
  saveDiagramInput,
} from "../schemas/bpmn";

/**
 * BPMN diagram mutations (ADR-0064). Project level is checked in-proc (ADR-0021) and the procs write
 * the audit row. A save answers with the new version and revalidates nothing: the editor already
 * holds what it saved, and a refresh mid-edit would replace the drawing under the user's hands.
 */
const PAGE = ["/projects/[id]/bpmn"];

export const createDiagramAction = action({
  name: "bpmn.create",
  schema: createDiagramInput,
  permission: "bpmn:create",
  revalidate: PAGE,
  handler: (input, ctx) => createDiagram(input, ctx.session.userId),
});

export const renameDiagramAction = action({
  name: "bpmn.rename",
  schema: renameDiagramInput,
  permission: "bpmn:update",
  revalidate: PAGE,
  handler: (input, ctx) => renameDiagram(input, ctx.session.userId),
});

export const saveDiagramAction = action({
  name: "bpmn.save",
  schema: saveDiagramInput,
  permission: "bpmn:update",
  handler: (input, ctx) => saveDiagram(input, ctx.session.userId),
});

export const deleteDiagramAction = action({
  name: "bpmn.delete",
  schema: deleteDiagramInput,
  permission: "bpmn:delete",
  revalidate: PAGE,
  handler: (input, ctx) => deleteDiagram(input, ctx.session.userId),
});
