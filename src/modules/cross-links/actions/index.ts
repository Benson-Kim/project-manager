"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/action";
import {
  createCrossLink,
  deleteCrossLink,
  getCrossLinkById,
  listCrossLinksForLocation,
  updateCrossLink,
} from "../repository/cross-links";
import {
  createPageNote,
  deletePageNote,
  getPageNoteById,
  listPageNotesForLocation,
  updatePageNote,
} from "../repository/page-notes";
import {
  createCrossLinkInput,
  deleteCrossLinkInput,
  getCrossLinkInput,
  listCrossLinksInput,
  updateCrossLinkInput,
} from "../schemas/cross-link";
import {
  createPageNoteInput,
  deletePageNoteInput,
  getPageNoteInput,
  listPageNotesInput,
  updatePageNoteInput,
} from "../schemas/page-note";

function revalidateEndpointHref(href: string) {
  const path = href.split("#")[0]?.split("?")[0];
  if (path) revalidatePath(path);
}

/**
 * Lists both 1-to-1 cross-links and small page notes touching the current screen.
 * Keeps working in read-only licence mode (ADR-0068).
 */
export const listLocationStickiesAction = action({
  name: "crossLinks.listLocation",
  schema: listCrossLinksInput,
  permission: "cross-links:read",
  licence: "read",
  handler: async (input, ctx) => {
    const [links, notes] = await Promise.all([
      listCrossLinksForLocation(input, ctx.session.userId),
      listPageNotesForLocation(input, ctx.session.userId),
    ]);
    return { links, notes };
  },
});

export const listCrossLinksAction = action({
  name: "crossLinks.list",
  schema: listCrossLinksInput,
  permission: "cross-links:read",
  licence: "read",
  handler: (input, ctx) => listCrossLinksForLocation(input, ctx.session.userId),
});

export const getCrossLinkAction = action({
  name: "crossLinks.getById",
  schema: getCrossLinkInput,
  permission: "cross-links:read",
  licence: "read",
  handler: (input, ctx) => getCrossLinkById(input.crossLinkId, ctx.session.userId),
});

export const createCrossLinkAction = action({
  name: "crossLinks.create",
  schema: createCrossLinkInput,
  permission: "cross-links:create",
  handler: async (input, ctx) => {
    const link = await createCrossLink(input, ctx.session.userId);
    revalidateEndpointHref(link.endA.href);
    revalidateEndpointHref(link.endB.href);
    return link;
  },
});

export const updateCrossLinkAction = action({
  name: "crossLinks.update",
  schema: updateCrossLinkInput,
  permission: "cross-links:update",
  handler: async (input, ctx) => {
    const link = await updateCrossLink(input, ctx.session.userId);
    revalidateEndpointHref(link.endA.href);
    revalidateEndpointHref(link.endB.href);
    return link;
  },
});

export const deleteCrossLinkAction = action({
  name: "crossLinks.delete",
  schema: deleteCrossLinkInput,
  permission: "cross-links:delete",
  handler: async (input, ctx) => {
    const result = await deleteCrossLink(input, ctx.session.userId);
    revalidatePath("/", "layout");
    return result;
  },
});

export const listPageNotesAction = action({
  name: "pageNotes.list",
  schema: listPageNotesInput,
  permission: "page-notes:read",
  licence: "read",
  handler: (input, ctx) => listPageNotesForLocation(input, ctx.session.userId),
});

export const getPageNoteAction = action({
  name: "pageNotes.getById",
  schema: getPageNoteInput,
  permission: "page-notes:read",
  licence: "read",
  handler: (input, ctx) => getPageNoteById(input.pageNoteId, ctx.session.userId),
});

export const createPageNoteAction = action({
  name: "pageNotes.create",
  schema: createPageNoteInput,
  permission: "page-notes:create",
  handler: async (input, ctx) => {
    const note = await createPageNote(input, ctx.session.userId);
    revalidateEndpointHref(note.href);
    return note;
  },
});

export const updatePageNoteAction = action({
  name: "pageNotes.update",
  schema: updatePageNoteInput,
  permission: "page-notes:update",
  handler: async (input, ctx) => {
    const note = await updatePageNote(input, ctx.session.userId);
    revalidateEndpointHref(note.href);
    return note;
  },
});

export const deletePageNoteAction = action({
  name: "pageNotes.delete",
  schema: deletePageNoteInput,
  permission: "page-notes:delete",
  handler: async (input, ctx) => {
    const result = await deletePageNote(input, ctx.session.userId);
    revalidatePath("/", "layout");
    return result;
  },
});
