"use client";

import { ChoiceSetting } from "@/components/ui/form/choice-setting";
import { IDLE_TIMEOUT_OPTIONS } from "@/lib/auth/idle-timeout";
import { messages } from "@/lib/messages";
import { setIdleTimeoutAction } from "../actions";

export function IdleTimeoutSetting({ idleTimeoutMinutes }: { idleTimeoutMinutes: number }) {
  return (
    <ChoiceSetting
      testId="idle-timeout-setting"
      label={messages.settings.signIn.idleTimeout}
      name="idleTimeoutMinutes"
      value={idleTimeoutMinutes}
      options={IDLE_TIMEOUT_OPTIONS}
      optionLabel={messages.settings.signIn.after}
      save={(minutes) => setIdleTimeoutAction({ idleTimeoutMinutes: minutes })}
    />
  );
}
