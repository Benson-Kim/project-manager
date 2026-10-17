import { getUploadsEnv, uploadsEnabled, uploadsQuotaBytes } from "@/lib/env";
import { scanFile } from "@/lib/files/scan";
import { sniffFile } from "@/lib/files/sniff";
import { freeBytes, storedFilesRoot, uploadsRoot } from "@/lib/files/store";
import { addFileAttachment, checkCanAddAttachment, getStoredFile } from "../repository/attachments";
import type { DownloadDeps } from "./download";
import type { UploadDeps } from "./upload";

/** The real wiring for the /api/files route files (the handlers take it injected, for tests). */
export const uploadDeps: UploadDeps = {
  uploadsEnabled,
  uploadsRoot,
  quotaBytes: uploadsQuotaBytes,
  minFreeBytes: () => getUploadsEnv().UPLOADS_MIN_FREE_MB * 1024 * 1024,
  freeBytes,
  checkCanAdd: checkCanAddAttachment,
  addFile: addFileAttachment,
  sniff: sniffFile,
  scan: scanFile,
};

export const downloadDeps: DownloadDeps = {
  storedFilesRoot,
  getFile: getStoredFile,
};
