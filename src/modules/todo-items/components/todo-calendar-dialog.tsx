"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Field } from "@/components/ui/form/field";
import { Input } from "@/components/ui/form/inputs";
import { notifySaved } from "@/lib/cross-window";
import { toDateInput } from "@/lib/format";
import { localWallClock } from "@/lib/local-time";
import { messages } from "@/lib/messages";
import {
  findScheduleConflictAction,
  scheduleTodoItemAction,
  updateTodoItemAction,
} from "../actions";
import { defaultCalendarForm, slotFromForm, type CalendarForm } from "../schemas/calendar-slot";
import type { TodoItemListRow } from "../schemas/todo-item";
import { todoItemFormValues } from "../schemas/todo-item-form";
import { slotProblem } from "../schemas/todo-schedule";
import { slotOf } from "../planner";

const P = messages.todoItems.planner;

type Form = CalendarForm & { dueDate: string };

/**
 * The to-do list's Calendar cell: opens a pop-up that books the to-do on the planner for one
 * day, warning first when another to-do already holds those times.
 */
export function TodoCalendarButton({
  row,
  children,
}: {
  row: TodoItemListRow;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [clash, setClash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const booked = slotOf(row.ScheduledStart, row.ScheduledEnd);
  const startDate = toDateInput(row.StartDate);
  const dueDate = toDateInput(row.DueDate);

  function open() {
    const initial = defaultCalendarForm(
      {
        start: booked?.start ?? null,
        end: booked?.end ?? null,
        startDate: startDate || null,
        dueDate: dueDate || null,
      },
      localWallClock(),
    );
    setForm({ ...initial, dueDate });
    setClash(false);
    setError(null);
  }

  function close() {
    setForm(null);
  }

  const set = (key: keyof Form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setError(null);
  };

  async function save(current: Form) {
    const slot = slotFromForm(current);
    let rowVer = row.RowVer;
    if (!row.Repeats && (current.day !== startDate || current.dueDate !== dueDate)) {
      const updated = await updateTodoItemAction({
        ...todoItemFormValues(row),
        startDate: current.day,
        dueDate: current.dueDate,
        localNow: localWallClock(),
      });
      if (!updated.ok) return setError(updated.error.message);
      rowVer = updated.data.RowVer;
    }
    const result = await scheduleTodoItemAction({
      todoItemId: row.TodoItemId,
      rowVer,
      start: slot.start,
      end: slot.end,
      startWas: booked?.start,
      localNow: localWallClock(),
    });
    if (!result.ok) return setError(result.error.message);
    close();
    notifySaved();
    router.refresh();
  }

  function check(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    const slot = slotFromForm(form);
    const problem = slotProblem(slot.start, slot.end, {
      now: localWallClock().slice(0, 16),
      startWas: booked?.start,
    });
    if (problem) return setError(P[problem]);
    startTransition(async () => {
      const found = await findScheduleConflictAction({ todoItemId: row.TodoItemId, ...slot });
      if (!found.ok) return setError(found.error.message);
      if (found.data.conflict) return setClash(true);
      await save(form);
    });
  }

  function proceed() {
    if (!form) return;
    startTransition(() => save(form));
  }

  const title = row.TodoItem ?? messages.app.untitled;
  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label={P.openCalendar(title)}
        className="rounded-md px-1 text-xs text-ink-muted hover:bg-hover"
        data-testid={`todo-calendar-open-${row.TodoItemId}`}
      >
        {booked ? children : P.addToCalendar}
      </button>
      <Dialog
        open={form !== null}
        onOpenChange={(next) => (next ? undefined : close())}
        title={clash ? P.conflictTitle : P.addToCalendar}
      >
        {form && clash ? (
          <div data-testid="todo-calendar-conflict">
            <p className="text-sm text-ink">{P.conflictBody}</p>
            {error ? (
              <p className="mt-2 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <DialogActions onCancel={() => setClash(false)}>
              <Button type="button" onClick={proceed} disabled={pending}>
                {P.continue}
              </Button>
            </DialogActions>
          </div>
        ) : form ? (
          <form
            onSubmit={check}
            className="grid grid-cols-2 gap-3"
            data-testid="todo-calendar-form"
          >
            <Field label={messages.todoItems.startDate} name="day">
              <Input type="date" required value={form.day} onChange={set("day")} />
            </Field>
            <Field label={messages.todoItems.dueDate} name="dueDate">
              <Input
                type="date"
                value={form.dueDate}
                onChange={set("dueDate")}
                disabled={!!row.Repeats}
              />
            </Field>
            <Field label={P.startTime} name="startTime">
              <Input type="time" required value={form.startTime} onChange={set("startTime")} />
            </Field>
            <Field label={P.endTime} name="endTime">
              <Input type="time" required value={form.endTime} onChange={set("endTime")} />
            </Field>
            {error ? (
              <p className="col-span-2 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <div className="col-span-2">
              <DialogActions onCancel={close}>
                <Button type="submit" disabled={pending}>
                  {P.addToCalendar}
                </Button>
              </DialogActions>
            </div>
          </form>
        ) : null}
      </Dialog>
    </>
  );
}
