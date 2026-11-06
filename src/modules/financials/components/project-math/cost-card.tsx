"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { messages } from "@/lib/messages";
import { costBuildUp } from "../../calc/project-analysis";
import { formatCurrency } from "../../calc/project-format";
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
} from "./card-ui";

const M = messages.financials.projectMath.cost;

export function CostCard({ onUse, currency }: CardProps) {
  const [form, setForm] = useState({
    hours: "120",
    rate: "65",
    people: "2",
    overheadPct: "15",
    contingencyPct: "10",
    units: "4",
  });
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const cost = useMemo(() => costBuildUp(form), [form]);
  const money = (value: number | null) => formatCurrency(value, { symbol: currency });

  return (
    <Card icon="∑" name={M.name}>
      <FieldGrid cols={3}>
        <Field label={M.hours} code="h" value={form.hours} onChange={set("hours")} />
        <Field label={M.rate} code="r" value={form.rate} onChange={set("rate")} />
        <Field label={M.people} code="n" value={form.people} onChange={set("people")} />
        <Field label={M.overheadPct} value={form.overheadPct} onChange={set("overheadPct")} />
        <Field
          label={M.contingencyPct}
          value={form.contingencyPct}
          onChange={set("contingencyPct")}
        />
        <Field label={M.units} code="u" value={form.units} onChange={set("units")} />
      </FieldGrid>

      <Hero
        label={M.total}
        value={money(cost.total)}
        testId="cost-total"
        badge={cost.perUnit === null ? null : <Badge value={M.perUnit(money(cost.perUnit))} />}
      />

      <Rows>
        <Kv label={M.labour} code="h × r × n" value={money(cost.labour)} />
        <Kv label={M.overhead} value={money(cost.overhead)} />
        <Kv label={M.subtotal} value={money(cost.subtotal)} />
        <Kv label={M.contingency} value={money(cost.contingency)} />
        <Kv label={M.totalRow} value={money(cost.total)} />
        <Kv label={M.perDeliverable} value={money(cost.perUnit)} />
      </Rows>

      <Note>{M.note}</Note>

      <Actions>
        <PipeButton
          value={cost.total}
          label={M.useTotal}
          display={money(cost.total)}
          onUse={onUse}
          primary
        />
        <PipeButton
          value={cost.perUnit}
          label={M.usePerUnit}
          display={money(cost.perUnit)}
          onUse={onUse}
        />
        <PipeButton
          value={cost.labour}
          label={M.useLabour}
          display={money(cost.labour)}
          onUse={onUse}
        />
      </Actions>
    </Card>
  );
}
