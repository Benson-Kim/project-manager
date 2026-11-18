"use server";

import { action } from "@/lib/action";
import {
  createWhiteboard,
  deleteWhiteboard,
  renameWhiteboard,
  saveWhiteboard,
} from "../repository/whiteboards";
import {
  createWhiteboardInput,
  deleteWhiteboardInput,
  renameWhiteboardInput,
  saveWhiteboardInput,
} from "../schemas/whiteboard";

/**
 * Project level is checked in-proc and the procs write the audit row. A save answers with the new
 * version and revalidates nothing: the canvas already holds what it saved.
 */
const PAGE = ["/projects/[id]/whiteboard"];

export const createWhiteboardAction = action({
  name: "whiteboard.create",
  schema: createWhiteboardInput,
  permission: "whiteboard:create",
  revalidate: PAGE,
  handler: (input, ctx) => createWhiteboard(input, ctx.session.userId),
});

export const renameWhiteboardAction = action({
  name: "whiteboard.rename",
  schema: renameWhiteboardInput,
  permission: "whiteboard:update",
  revalidate: PAGE,
  handler: (input, ctx) => renameWhiteboard(input, ctx.session.userId),
});

export const saveWhiteboardAction = action({
  name: "whiteboard.save",
  schema: saveWhiteboardInput,
  permission: "whiteboard:update",
  handler: (input, ctx) => saveWhiteboard(input, ctx.session.userId),
});

export const deleteWhiteboardAction = action({
  name: "whiteboard.delete",
  schema: deleteWhiteboardInput,
  permission: "whiteboard:delete",
  revalidate: PAGE,
  handler: (input, ctx) => deleteWhiteboard(input, ctx.session.userId),
});
