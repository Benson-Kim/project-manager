import type { AppErrorCode } from "@/lib/errors";
import { messages } from "@/lib/messages";

export const licenceMessages = {
  inactive:
    "Changes are paused until this copy's licence is active. You can still view and export your work.",
} as const;

export const errorMessage = (code: AppErrorCode): string =>
  code === "LICENCE_INACTIVE" ? licenceMessages.inactive : messages.errors[code];
