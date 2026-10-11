import { getUploadsEnv, uploadsEnabled } from "@/lib/env";
import { scanFile } from "@/lib/files/scan";
import { sniffFile } from "@/lib/files/sniff";
import { freeBytes, uploadsRoot } from "@/lib/files/store";
import { addFileAttachment, checkCanAddAttachment, getStoredFile } from "../repository/attachments";
import type { DownloadDeps } from "./download";
import type { UploadDeps } from "./upload";

/** The real wiring for the /api/files route files (the handlers take it injected, for tests). */
export const uploadDeps: UploadDeps = {
  uploadsEnabled,
  uploadsRoot,
  quotaBytes: () => getUploadsEnv().UPLOADS_QUOTA_MB_PER_PROJECT * 1024 * 1024,
  minFreeBytes: () => getUploadsEnv().UPLOADS_MIN_FREE_MB * 1024 * 1024,
  freeBytes,
  checkCanAdd: checkCanAddAttachment,
  addFile: addFileAttachment,
  sniff: sniffFile,
  scan: scanFile,
};

export const downloadDeps: DownloadDeps = {
  uploadsRoot,
  getFile: getStoredFile,
};
