import type { Metadata } from "next";
import { messages } from "@/lib/messages";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = {
  title: `${messages.auth.changePasswordTitle} — ${messages.app.name}`,
};

/**
 * Forced (and voluntary) password change (module #4). Users with
 * MustChangePassword = 1 are routed here by the proxy gate and cannot reach
 * anything else until they set a new password.
 */
export default function ChangePasswordPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-ink">{messages.auth.changePasswordTitle}</h1>
        <p className="text-sm text-ink-muted">{messages.auth.changePasswordIntro}</p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
