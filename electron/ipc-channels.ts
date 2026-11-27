export const PRINT_PREVIEW_CHANNEL = "print-preview";
export const SAVE_WORK_CHANNEL = "page:save-work";
export const DATABASE_READY_CHANNEL = "database:ensure-ready";
export const PAGE_NOTE_OPEN_CHANNEL = "page:add-page-note";
export const CROSS_LINK_START_CHANNEL = "page:add-cross-link";
export const CROSS_LINK_COMPLETE_CHANNEL = "page:complete-cross-link";
export const OPEN_LOCAL_PATH_CHANNEL = "page:open-local-path";

export const LICENCE_CHANNELS = {
  state: "licence:state",
  trialRequest: "licence:trial-request",
  trialVerify: "licence:trial-verify",
  redeem: "licence:redeem",
  reconnect: "licence:reconnect",
  feedbackSend: "feedback:send",
  feedbackConsent: "feedback:consent",
} as const;
