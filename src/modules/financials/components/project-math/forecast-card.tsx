"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { messages } from "@/lib/messages";
import { deliveryForecast } from "../../calc/project-analysis";
import { toIsoDate } from "../../calc/project-math";
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
  StaticField,
} from "./card-ui";

const M = messages.financials.projectMath.forecast;

function initialForm() {
  const now = new Date();
  return {
    velocity: "25",
    backlog: "130",
    sprintWeeks: "2",
    start: toIsoDate(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
    target: "",
  };
}

export function ForecastCard({ onUse }: CardProps) {
  const [form, setForm] = useState(initialForm);
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const forecast = useMemo(() => deliveryForecast(form), [form]);
  const ready = forecast.sprints !== null;
  const required = forecast.requiredVelocity;
  const current = Number(form.velocity);

  return (
    <Card icon="⇢" name={M.name}>
      <FieldGrid>
        <Field label={M.velocity} code="V" value={form.velocity} onChange={set("velocity")} />
        <Field label={M.backlog} code="B" value={form.backlog} onChange={set("backlog")} />
        <Field
          label={M.sprintLength}
          code="wks"
          value={form.sprintWeeks}
          onChange={set("sprintWeeks")}
        />
        <Field label={M.start} kind="date" value={form.start} onChange={set("start")} />
      </FieldGrid>

      <Hero
        label={M.sprints}
        value={ready ? formatNumber(forecast.sprints) : "—"}
        unit={ready ? M.weeks(formatDecimal(forecast.weeks, 1)) : undefined}
        testId="forecast-sprints"
        badge={forecast.finishMs === null ? null : <Badge value={formatDay(forecast.finishMs)} />}
      />

      <FieldGrid>
        <Field
          label={M.deadline}
          code="T"
          kind="date"
          value={form.target}
          onChange={set("target")}
        />
        <StaticField
          label={M.needed}
          testId="forecast-required"
          value={required === null ? "—" : M.perSprint(formatDecimal(required, 1))}
        />
      </FieldGrid>

      <Rows>
        <Kv label={M.perWeek} value={formatDecimal(forecast.velocityPerWeek, 2)} />
        <Kv label={M.weeksAvailable} value={formatDecimal(forecast.weeksAvailable, 1)} />
        <Kv label={M.finish} value={formatDay(forecast.finishMs)} />
      </Rows>

      {required !== null && required > current ? (
        <Note tone="warning">
          {M.tooSlow(formatDecimal(required, 1), formatDecimal(current, 1))}
        </Note>
      ) : null}
      <Note>{M.note}</Note>

      <Actions>
        <PipeButton
          value={forecast.sprints}
          label={M.useSprints}
          display={formatDecimal(forecast.sprints, 0)}
          onUse={onUse}
          primary
        />
        <PipeButton
          value={required}
          label={M.useRequired}
          display={formatDecimal(required, 2)}
          onUse={onUse}
        />
      </Actions>
    </Card>
  );
}
