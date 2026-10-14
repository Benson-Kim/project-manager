import type { Permission } from "@/lib/auth/types";
import type { AttachmentOwner } from "../schemas/attachment";

/**
 * The attachment owner registry (ADR-0026 §1). Attachments are owner-scoped:
 * each owner has its own link table and procs in its own folder, checked with
 * its own access helper and permission, so overrides and Contributor rules
 * follow the owner's section. Adding an owner = link table + six procs + one
 * entry here (src/modules/file-storage/tests/owners.test.ts checks the procs
 * exist and are covered by the access guardrail).
 */
export interface AttachmentOwnerConfig {
  /** db/procs/<folder>/ — the folder src/tests/proc-access-levels.test.ts maps to `module`. */
  folder: string;
  /** The owner's id parameter in its procs, e.g. "DailyActivityId". */
  idParam: string;
  procs: {
    canAdd: string;
    add: string;
    list: string;
    get: string;
    rename: string;
    remove: string;
  };
  /** Read to list and download; update to add, rename and remove (user decision 2026-10-10). */
  permissions: { read: Permission; update: Permission };
}

export const ATTACHMENT_OWNER_CONFIG: Record<AttachmentOwner, AttachmentOwnerConfig> = {
  "daily-activity": {
    folder: "daily-activity",
    idParam: "DailyActivityId",
    procs: {
      canAdd: "usp_DailyActivity_CanAddFile",
      add: "usp_DailyActivity_AddFile",
      list: "usp_DailyActivity_ListFiles",
      get: "usp_DailyActivity_GetFile",
      rename: "usp_DailyActivity_RenameFile",
      remove: "usp_DailyActivity_RemoveFile",
    },
    permissions: { read: "daily-activities:read", update: "daily-activities:update" },
  },
};

export function ownerConfig(owner: AttachmentOwner): AttachmentOwnerConfig {
  return ATTACHMENT_OWNER_CONFIG[owner];
}
