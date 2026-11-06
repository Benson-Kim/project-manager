"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button-styles";
import { messages } from "@/lib/messages";
import { addWorkingDays, duration, toIsoDate } from "../../calc/project-math";
import { formatDay, formatDecimal, formatNumber } from "../../calc/project-format";
import {
  Actions,
  Card,
  type CardProps,
  Field,
  FieldGrid,
  Hero,
  Kv,
  Note,
  PipeButton,
  Rows,
  SectionLabel,
  StaticField,
} from "./card-ui";

const M = messages.financials.projectMath.duration;
const DAY = 86_400_000;

function initialForm() {
  const now = new Date();
  const start = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    start: toIsoDate(start),
    end: toIsoDate(start + 20 * DAY),
    holidays: "0",
    workingDaysOnly: true,
  };
}

export function DurationCard({ onUse }: CardProps) {
  const [form, setForm] = useState(initialForm);
  const [days, setDays] = useState("15");
  const update = (patch: Partial<typeof form>) =>
    setForm((previous) => ({ ...previous, ...patch }));

  const span = useMemo(
    () => duration({ start: form.start, end: form.end, holidays: form.holidays }),
    [form.start, form.end, form.holidays],
  );
  const deadline = useMemo(
    () => addWorkingDays({ start: form.start, days, holidays: form.holidays }),
    [form.start, form.holidays, days],
  );

  const primary =
    span.calendarDays === null ? null : form.workingDaysOnly ? span.workingDays : span.calendarDays;
  const count = (value: number | null) => (value === null ? "—" : formatNumber(value));

  return (
    <Card icon="◷" tone="success" name={M.name}>
      <FieldGrid>
        <Field
          label={M.start}
          kind="date"
          value={form.start}
          onChange={(start) => update({ start })}
        />
        <Field label={M.end} kind="date" value={form.end} onChange={(end) => update({ end })} />
        <Field
          label={M.holidays}
          value={form.holidays}
          onChange={(holidays) => update({ holidays })}
        />
        <div className="flex flex-col gap-1.5">
          <SectionLabel>{M.count}</SectionLabel>
          <div className="flex gap-1" role="group" aria-label={M.count}>
            {[
              { working: true, text: M.working },
              { working: false, text: M.calendar },
            ].map((mode) => (
              <button
                key={mode.text}
                type="button"
                aria-pressed={form.workingDaysOnly === mode.working}
                onClick={() => update({ workingDaysOnly: mode.working })}
                className={buttonClass(
                  form.workingDaysOnly === mode.working ? "primary" : "secondary",
                  "compact",
                )}
              >
                {mode.text}
              </button>
            ))}
          </div>
        </div>
      </FieldGrid>

      <Hero
        label={form.workingDaysOnly ? M.workingDays : M.calendarDays}
        value={count(primary)}
        unit={M.days}
        testId="duration-days"
        badge={
          form.workingDaysOnly && span.workingDays !== null ? (
            <Badge value={M.weeks(span.workWeeks, span.workRemainder)} />
          ) : null
        }
      />

      <Rows>
        <Kv label={M.calendarInclusive} value={count(span.calendarDays)} />
        <Kv label={M.weekdays} value={count(span.weekdays)} />
        <Kv label={M.holidaysExcluded} value={formatNumber(span.holidayCount)} />
        <Kv label={M.workingDays} value={count(span.workingDays)} tone="good" />
        {span.startMs !== null ? <Kv label={M.startsOn} value={formatDay(span.startMs)} /> : null}
        {span.endMs !== null ? <Kv label={M.endsOn} value={formatDay(span.endMs)} /> : null}
      </Rows>

      {span.reversed ? <Note tone="warning">{M.reversed}</Note> : null}

      <FieldGrid>
        <Field label={M.addDays} code="+N" value={days} onChange={setDays} />
        <StaticField label={M.lands} testId="deadline-date" value={formatDay(deadline.dateMs)} />
      </FieldGrid>

      <Note>{M.note}</Note>

      <Actions>
        <PipeButton
          value={primary}
          label={M.useDays}
          display={formatDecimal(primary, 0)}
          onUse={onUse}
          primary
        />
        <PipeButton
          value={span.workingDays}
          label={M.useWorkingDays}
          display={formatDecimal(span.workingDays, 0)}
          onUse={onUse}
        />
      </Actions>
    </Card>
  );
}
