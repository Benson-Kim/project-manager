import type { Permission } from "@/lib/auth/types";
import {
  NOTE_ACCEPT_POLICY,
  resolveAcceptPolicy,
  type AttachmentAcceptPolicy,
  type AttachmentOwner,
} from "../schemas/attachment";

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
  /** What an upload to this owner may be; whatever is left out follows the defaults. */
  accept?: Partial<AttachmentAcceptPolicy>;
  /** Its add proc takes @IsInline: pictures pasted into the text stay out of the attachment list. */
  inlineFiles?: true;
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
    inlineFiles: true,
  },
  // A financial's checklist document (ADR-0030): signed contracts, requisitions, the DA itself.
  "financial-document": {
    folder: "financial-document",
    idParam: "FinancialDocumentId",
    procs: {
      canAdd: "usp_FinancialDocument_CanAddFile",
      add: "usp_FinancialDocument_AddFile",
      list: "usp_FinancialDocument_ListFiles",
      get: "usp_FinancialDocument_GetFile",
      rename: "usp_FinancialDocument_RenameFile",
      remove: "usp_FinancialDocument_RemoveFile",
    },
    permissions: { read: "financials:read", update: "financials:update" },
  },
  // A project note (ADR-0026): a picture pasted into a note is kept with it.
  note: {
    folder: "note",
    idParam: "NoteId",
    procs: {
      canAdd: "usp_Note_CanAddFile",
      add: "usp_Note_AddFile",
      list: "usp_Note_ListFiles",
      get: "usp_Note_GetFile",
      rename: "usp_Note_RenameFile",
      remove: "usp_Note_RemoveFile",
    },
    permissions: { read: "notes:read", update: "notes:update" },
    accept: NOTE_ACCEPT_POLICY,
  },
};

export function ownerConfig(owner: AttachmentOwner): AttachmentOwnerConfig {
  return ATTACHMENT_OWNER_CONFIG[owner];
}

/** The owner's effective upload policy. */
export function ownerAcceptPolicy(owner: AttachmentOwner): AttachmentAcceptPolicy {
  return resolveAcceptPolicy(ATTACHMENT_OWNER_CONFIG[owner].accept);
}
