"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAnnouncer } from "@/components/ui/announcer";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorSummary } from "@/components/ui/form/error-summary";
import { Field } from "@/components/ui/form/field";
import { DatePicker } from "@/components/ui/form/inputs";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { messages } from "@/lib/messages";
import { setTodoOccurrenceAction } from "../actions";
import type { CalendarEntry } from "../calendar";
import { COMPLETED_STATUS, isClosedStatus } from "../schemas/todo-item";

const C = messages.todoItems.calendar;

type Change = { status: string | null; movedTo: string | null; isSkipped: boolean };

/**
 * One occurrence of a series: change just this one (done, move, skip) or open the whole series.
 * Clearing every change puts the occurrence back as the rule makes it.
 */
export function TodoOccurrenceDialog({
  entry,
  onClose,
  onSeries,
}: {
  entry: CalendarEntry | null;
  onClose: () => void;
  onSeries: (entry: CalendarEntry) => void;
}) {
  return (
    <Dialog
      open={entry?.occurrence != null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title={entry?.todo.title ?? messages.app.untitled}
      description={entry ? C.occurrenceOn(formatDate(entry.day), entry.time) : undefined}
    >
      {entry?.occurrence ? (
        <OccurrenceChoices key={entry.key} entry={entry} onClose={onClose} onSeries={onSeries} />
      ) : null}
    </Dialog>
  );
}

function OccurrenceChoices({
  entry,
  onClose,
  onSeries,
}: {
  entry: CalendarEntry;
  onClose: () => void;
  onSeries: (entry: CalendarEntry) => void;
}) {
  const occurrence = entry.occurrence!;
  const router = useRouter();
  const { toast } = useToast();
  const { announce } = useAnnouncer();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<string | null>(null);
  const [moveDay, setMoveDay] = useState(entry.day);
  const startsAt = occurrence.movedTo ?? occurrence.occursAt;

  const save = (change: Change) => {
    setSummary(null);
    startTransition(async () => {
      const result = await setTodoOccurrenceAction({
        todoItemId: entry.todo.todoItemId,
        occursAt: occurrence.occursAt,
        rowVer: occurrence.rowVer,
        ...change,
      });
      if (result.ok) {
        toast({ variant: "success", title: messages.feedback.saved });
        announce(messages.feedback.saved);
        onClose();
        router.refresh();
      } else {
        setSummary(result.error.message);
      }
    });
  };

  const keep = { status: entry.status, movedTo: occurrence.movedTo, isSkipped: false };
  const plain = { status: null, movedTo: null, isSkipped: false };

  return (
    <div className="flex flex-col gap-4" data-testid="occurrence-dialog">
      <ErrorSummary message={summary} />
      <section className="flex flex-col gap-2" aria-labelledby="occurrence-this-one">
        <h3 id="occurrence-this-one" className="text-sm font-semibold text-ink">
          {C.thisOne}
        </h3>
        {occurrence.isSkipped ? (
          <Button type="button" variant="secondary" pending={pending} onClick={() => save(plain)}>
            {C.unskip}
          </Button>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                pending={pending}
                data-testid="occurrence-done"
                onClick={() =>
                  save({
                    ...keep,
                    status: isClosedStatus(entry.status) ? null : COMPLETED_STATUS,
                  })
                }
              >
                {isClosedStatus(entry.status) ? C.reopen : C.markDone}
              </Button>
              <Button
                type="button"
                variant="secondary"
                pending={pending}
                data-testid="occurrence-skip"
                onClick={() => save({ status: null, movedTo: null, isSkipped: true })}
              >
                {C.skip}
              </Button>
            </div>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                save({ ...keep, movedTo: `${moveDay}${startsAt.slice(10)}` });
              }}
            >
              <Field label={C.moveTo} name="occurrenceMoveTo">
                <DatePicker
                  value={moveDay}
                  required
                  onChange={(event) => setMoveDay(event.target.value)}
                />
              </Field>
              <Button
                type="submit"
                variant="secondary"
                pending={pending}
                disabled={moveDay === "" || moveDay === entry.day}
              >
                {C.move}
              </Button>
            </form>
          </>
        )}
      </section>
      <section
        className="flex flex-col gap-2 border-t border-line pt-3"
        aria-labelledby="occurrence-series"
      >
        <h3 id="occurrence-series" className="text-sm font-semibold text-ink">
          {C.series}
        </h3>
        <Button
          type="button"
          variant="secondary"
          data-testid="occurrence-series"
          onClick={() => onSeries(entry)}
        >
          {C.openSeries}
        </Button>
      </section>
    </div>
  );
}
