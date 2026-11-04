"use client";

import { ChoiceSetting } from "@/components/ui/form/choice-setting";
import { messages } from "@/lib/messages";
import { setDueSoonDaysAction } from "../actions";
import { DUE_SOON_DAY_OPTIONS } from "../schemas/todo-item";

export function DueSoonSetting({ dueSoonDays }: { dueSoonDays: number }) {
  return (
    <ChoiceSetting
      testId="due-soon-setting"
      label={messages.settings.todos.dueSoon}
      name="dueSoonDays"
      value={dueSoonDays}
      options={DUE_SOON_DAY_OPTIONS}
      optionLabel={messages.settings.todos.withinDays}
      save={(days) => setDueSoonDaysAction({ dueSoonDays: days })}
    />
  );
}
