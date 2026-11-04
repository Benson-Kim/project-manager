"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { DatePicker, Input, Select } from "@/components/ui/form/inputs";
import { useToast } from "@/components/ui/toast";
import type { ActionResult } from "@/lib/action";
import { localWallClock } from "@/lib/local-time";
import { messages } from "@/lib/messages";
import { clearTodoRecurrenceAction, setTodoRecurrenceAction } from "../actions";
import {
  MONTH_MODES,
  ORDINALS,
  REPEAT_UNITS,
  type MonthMode,
  type RecurrenceRule,
  type RepeatUnit,
} from "../recurrence";
import {
  bit,
  draftOf,
  errorsOf,
  patternKey,
  ruleOf,
  WEEKDAYS,
  type Draft,
  type Ending,
  type RuleErrors,
} from "../recurrence-draft";
import { recurrenceRuleSchema, type TodoRecurrence } from "../schemas/todo-recurrence";

const R = messages.todoItems.repeat;

/**
 * The to-do's Repeat section (ADR-0059): its own form beside the alert, saved through the rule
 * actions. A rule write moves the to-do's RowVer, so every save refreshes the page.
 */
export function TodoRecurrenceSection({
  todoItemId,
  rowVer,
  startDate,
  recurrence,
  canEdit,
  onDirtyChange,
}: {
  todoItemId: number;
  /** The to-do's RowVer, the one token for the to-do and its rule. */
  rowVer: number;
  /** "YYYY-MM-DD", or null: a to-do repeats from its start date. */
  startDate: string | null;
  recurrence: TodoRecurrence | null;
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const saved = recurrence?.rule ?? null;
  const [open, setOpen] = useState(saved !== null);
  const [draft, setDraft] = useState(() => draftOf(saved, startDate ?? "2000-01-03"));
  const [errors, setErrors] = useState<RuleErrors>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!canEdit && saved === null) return null;

  const change = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    onDirtyChange(true);
  };
  const rule = ruleOf(draft);
  const patternChanges = saved !== null && patternKey(rule) !== patternKey(saved);

  const fieldErrors = (key: keyof RecurrenceRule) => {
    const message = errors[key];
    return message ? [message] : undefined;
  };

  const finish = (result: ActionResult<unknown>) => {
    if (result.ok) {
      onDirtyChange(false);
      toast({ variant: "success", title: messages.feedback.saved });
      announce(messages.feedback.saved);
      router.refresh();
    } else {
      setSummary(result.error.message);
      if (result.error.code === "CONFLICT") setConflict(true);
    }
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = recurrenceRuleSchema.safeParse(rule);
    if (!parsed.success) {
      setErrors(errorsOf(parsed.error));
      setSummary(messages.errors.VALIDATION);
      return;
    }
    setErrors({});
    setSummary(null);
    setConflict(false);
    startTransition(async () => {
      finish(
        await setTodoRecurrenceAction({
          todoItemId,
          rowVer,
          rule: parsed.data,
          localNow: localWallClock(),
        }),
      );
    });
  };

  const onRemove = () => {
    startTransition(async () => {
      const result = await clearTodoRecurrenceAction({ todoItemId, rowVer });
      setConfirmRemove(false);
      setOpen(!result.ok);
      finish(result);
    });
  };

  return (
    <div className="flex flex-col gap-4 border-t border-line pt-4" data-testid="todo-repeat">
      <div className="flex items-center justify-between px-4">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="text-sm font-semibold text-ink"
        >
          {R.section}
        </button>
        {saved && canEdit ? (
          <Button type="button" variant="danger" onClick={() => setConfirmRemove(true)}>
            {R.remove}
          </Button>
        ) : null}
        {!saved && !open ? (
          <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
            {R.configure}
          </Button>
        ) : null}
      </div>
      {open && startDate === null ? (
        <p className="px-4 text-sm text-ink-muted">{R.needsStartDate}</p>
      ) : null}
      {open && startDate !== null ? (
        <form noValidate onSubmit={onSubmit} data-testid="todo-repeat-form" className="px-4">
          <fieldset disabled={!canEdit} className="flex flex-col gap-4">
            <ErrorSummary message={summary} />
            {conflict ? (
              <div>
                <Button type="button" variant="secondary" onClick={() => router.refresh()}>
                  {messages.todoItems.reload}
                </Button>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={R.unit} name="repeatRuleUnit" errors={fieldErrors("unit")}>
                <Select
                  name="repeatRuleUnit"
                  value={draft.unit}
                  onChange={(e) => change({ unit: e.target.value as RepeatUnit })}
                >
                  {REPEAT_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {R.units[u]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={R.every} name="repeatRuleEvery" errors={fieldErrors("every")}>
                <Input
                  type="number"
                  name="repeatRuleEvery"
                  min={1}
                  max={999}
                  value={draft.every}
                  onChange={(e) => change({ every: e.target.value })}
                />
              </Field>
            </div>
            {draft.unit === "Hour" ? (
              <Field
                label={R.startTime}
                name="repeatRuleStartTime"
                errors={fieldErrors("startTime")}
              >
                <Input
                  type="time"
                  name="repeatRuleStartTime"
                  value={draft.startTime}
                  onChange={(e) => change({ startTime: e.target.value })}
                />
              </Field>
            ) : null}
            {draft.unit === "Week" ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-ink">{R.days}</legend>
                <div className="flex flex-wrap gap-3">
                  {WEEKDAYS.map((day) => (
                    <label key={day} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={(draft.weekdays & bit(day)) !== 0}
                        onChange={() => change({ weekdays: draft.weekdays ^ bit(day) })}
                      />
                      {R.weekdays[day - 1]}
                    </label>
                  ))}
                </div>
                {errors.weekdays ? (
                  <p role="alert" className="text-sm text-danger">
                    {errors.weekdays}
                  </p>
                ) : null}
              </fieldset>
            ) : null}
            {draft.unit === "Month" ? (
              <Field
                label={R.monthMode}
                name="repeatRuleMonthMode"
                errors={fieldErrors("monthMode")}
              >
                <Select
                  name="repeatRuleMonthMode"
                  value={draft.monthMode}
                  onChange={(e) => change({ monthMode: e.target.value as MonthMode })}
                >
                  {MONTH_MODES.map((m) => (
                    <option key={m} value={m}>
                      {R.monthModes[m]}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {draft.unit === "Month" && draft.monthMode === "NthWeekday" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={R.ordinal} name="repeatRuleOrdinal">
                  <Select
                    name="repeatRuleOrdinal"
                    value={String(draft.ordinal)}
                    onChange={(e) => change({ ordinal: Number(e.target.value) })}
                  >
                    {ORDINALS.map((o) => (
                      <option key={o} value={o}>
                        {R.ordinals[o]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={R.weekday} name="repeatRuleWeekday" errors={fieldErrors("weekday")}>
                  <Select
                    name="repeatRuleWeekday"
                    value={String(draft.weekday)}
                    onChange={(e) => change({ weekday: Number(e.target.value) })}
                  >
                    {WEEKDAYS.map((day) => (
                      <option key={day} value={day}>
                        {R.weekdays[day - 1]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={R.ends} name="repeatRuleEnds">
                <Select
                  name="repeatRuleEnds"
                  value={draft.ending}
                  onChange={(e) => change({ ending: e.target.value as Ending })}
                >
                  <option value="never">{R.endsNever}</option>
                  <option value="on">{R.endsOn}</option>
                  <option value="after">{R.endsAfter}</option>
                </Select>
              </Field>
              {draft.ending === "on" ? (
                <Field label={R.endsOnDate} name="repeatRuleEndsOn" errors={fieldErrors("endsOn")}>
                  <DatePicker
                    name="repeatRuleEndsOn"
                    min={startDate}
                    value={draft.endsOn}
                    onChange={(e) => change({ endsOn: e.target.value })}
                  />
                </Field>
              ) : null}
              {draft.ending === "after" ? (
                <Field
                  label={R.endsAfterCount}
                  name="repeatRuleEndsAfter"
                  errors={fieldErrors("endsAfter")}
                >
                  <Input
                    type="number"
                    name="repeatRuleEndsAfter"
                    min={1}
                    max={999}
                    value={draft.endsAfter}
                    onChange={(e) => change({ endsAfter: e.target.value })}
                  />
                </Field>
              ) : null}
            </div>
            {patternChanges ? (
              <p role="status" className="text-sm text-ink-muted" data-testid="todo-repeat-warning">
                {R.patternWarning}
              </p>
            ) : null}
            {canEdit ? (
              <div>
                <Button type="submit" pending={pending} data-testid="todo-repeat-save">
                  {messages.actions.save}
                </Button>
              </div>
            ) : null}
          </fieldset>
        </form>
      ) : null}
      {saved && canEdit ? (
        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title={R.removeTitle}
          body={R.removeBody}
          confirmLabel={R.remove}
          onConfirm={onRemove}
          pending={pending}
        />
      ) : null}
    </div>
  );
}
