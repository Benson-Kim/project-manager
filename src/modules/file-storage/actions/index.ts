"use server";

import { z } from "zod";
import { action } from "@/lib/action";
import { uploadsEnabled } from "@/lib/env";
import { uploadsRoot } from "@/lib/files/store";
import { SWEEP_GRACE_DAYS, sweepOrphanFiles } from "@/lib/files/sweep";
import {
  addLocationAttachment,
  listRetainedHashes,
  removeAttachment,
  renameAttachment,
} from "../repository/attachments";
import { ownerConfig } from "../repository/owners";
import {
  addLocationInput,
  removeAttachmentInput,
  renameAttachmentInput,
} from "../schemas/attachment";

/**
 * Attachment mutations without bytes (ADR-0026 §3); uploads go through
 * POST /api/files. The permission is the OWNER's update — renaming or removing
 * an attachment edits the record (user decision 2026-10-10) — and the owner's
 * proc enforces it per project. The sheets refresh with router.refresh().
 */

/** Rename an attachment; a file keeps its extension (the proc restores it). */
export const renameAttachmentAction = action({
  name: "attachments.rename",
  schema: renameAttachmentInput,
  permission: (input) => ownerConfig(input.owner).permissions.update,
  handler: (input, ctx) =>
    renameAttachment(
      input.owner,
      input.fileAttachmentId,
      input.fileName,
      input.rowVer,
      ctx.session.userId,
    ),
});

/** Remove (soft-delete) an attachment; the bytes stay until the orphan sweep. */
export const removeAttachmentAction = action({
  name: "attachments.remove",
  schema: removeAttachmentInput,
  permission: (input) => ownerConfig(input.owner).permissions.update,
  handler: async (input, ctx) => {
    await removeAttachment(input.owner, input.fileAttachmentId, input.rowVer, ctx.session.userId);
    return { fileAttachmentId: input.fileAttachmentId };
  },
});

/** Record where a file is kept, without uploading it (checklist row 44). */
export const addLocationAction = action({
  name: "attachments.add-location",
  schema: addLocationInput,
  permission: (input) => ownerConfig(input.owner).permissions.update,
  handler: (input, ctx) =>
    addLocationAttachment(
      input.owner,
      input.ownerId,
      input.fileName,
      input.storageLocation,
      ctx.session.userId,
    ),
});

/**
 * Delete stored files no attachment uses any more (ADR-0026 §5). Admin only:
 * the gate refuses "admin:*" to Users, and the proc checks the role again.
 * Scheduling it is F2's.
 */
export const sweepOrphanFilesAction = action({
  name: "attachments.sweep",
  schema: z.object({}),
  permission: "admin:files",
  handler: async (_input, ctx) => {
    // Uploads off (a desktop PC not set up for them yet): nothing is stored to sweep.
    if (!uploadsEnabled()) return { deleted: 0, kept: 0, tempDeleted: 0 };
    const retained = await listRetainedHashes(SWEEP_GRACE_DAYS, ctx.session.userId);
    return sweepOrphanFiles(await uploadsRoot(), retained, { graceDays: SWEEP_GRACE_DAYS });
  },
});
