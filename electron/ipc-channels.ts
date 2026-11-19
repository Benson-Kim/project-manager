export const PRINT_PREVIEW_CHANNEL = "print-preview";
export const DATABASE_READY_CHANNEL = "database:ensure-ready";

export const LICENCE_CHANNELS = {
  state: "licence:state",
  trialRequest: "licence:trial-request",
  trialVerify: "licence:trial-verify",
  redeem: "licence:redeem",
  reconnect: "licence:reconnect",
  feedbackSend: "feedback:send",
  feedbackConsent: "feedback:consent",
} as const;
