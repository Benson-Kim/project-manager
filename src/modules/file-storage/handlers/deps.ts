import { getUploadsEnv } from "@/lib/env";
import { scanFile } from "@/lib/files/scan";
import { sniffFile } from "@/lib/files/sniff";
import { uploadsRoot } from "@/lib/files/store";
import { addFileAttachment, checkCanAddAttachment, getStoredFile } from "../repository/attachments";
import type { DownloadDeps } from "./download";
import { getFileSession } from "./session";
import type { UploadDeps } from "./upload";

/** The real wiring for the /api/files route files (the handlers take it injected, for tests). */
export const uploadDeps: UploadDeps = {
  getSession: getFileSession,
  uploadsRoot,
  quotaBytes: () => getUploadsEnv().UPLOADS_QUOTA_MB_PER_PROJECT * 1024 * 1024,
  checkCanAdd: checkCanAddAttachment,
  addFile: addFileAttachment,
  sniff: sniffFile,
  scan: scanFile,
};

export const downloadDeps: DownloadDeps = {
  getSession: getFileSession,
  uploadsRoot,
  getFile: getStoredFile,
};
