"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { messages } from "@/lib/messages";
import { earnedValue } from "../../calc/project-math";
import { formatCurrency, formatDecimal } from "../../calc/project-format";
import {
  Actions,
  Card,
  type CardProps,
  Field,
  FieldGrid,
  Kv,
  MiniStat,
  Note,
  PipeButton,
  Rows,
} from "./card-ui";

const M = messages.financials.projectMath.earnedValue;

export function EarnedValueCard({ onUse, currency }: CardProps) {
  const [form, setForm] = useState({ bac: "250000", pv: "120000", ev: "110000", ac: "130000" });
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const metrics = useMemo(() => earnedValue(form), [form]);
  const money = (value: number | null) => formatCurrency(value, { symbol: currency });
  const scale = Math.max(metrics.bac ?? 0, metrics.pv ?? 0, metrics.ev ?? 0, metrics.ac ?? 0) || 1;
  const width = (value: number | null) =>
    `${Math.max(0, Math.min(100, ((value ?? 0) / scale) * 100))}%`;

  const bars = [
    { label: "PV", value: metrics.pv, fill: "bg-accent-strong" },
    { label: "EV", value: metrics.ev, fill: "bg-success" },
    { label: "AC", value: metrics.ac, fill: "bg-danger" },
  ];

  return (
    <Card icon="◱" name={M.name}>
      <FieldGrid>
        <Field label={M.bac} code="BAC" value={form.bac} onChange={set("bac")} />
        <Field label={M.pv} code="PV" value={form.pv} onChange={set("pv")} />
        <Field label={M.ev} code="EV" value={form.ev} onChange={set("ev")} />
        <Field label={M.ac} code="AC" value={form.ac} onChange={set("ac")} />
      </FieldGrid>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat
          label={M.cpi}
          testId="ev-cpi"
          value={formatDecimal(metrics.cpi)}
          tone={metrics.cpi === null ? "neutral" : metrics.cpi >= 1 ? "good" : "bad"}
        />
        <MiniStat
          label={M.spi}
          value={formatDecimal(metrics.spi)}
          tone={metrics.spi === null ? "neutral" : metrics.spi >= 1 ? "accent" : "warn"}
        />
        <MiniStat
          label={M.complete}
          value={
            metrics.pctComplete === null ? "—" : `${formatDecimal(metrics.pctComplete * 100, 0)}%`
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        {bars.map((bar) => (
          <div
            className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2.5"
            key={bar.label}
          >
            <span className="font-mono text-[0.6875rem] text-ink-muted">{bar.label}</span>
            <span className="block h-2 overflow-hidden rounded-full bg-surface-sunken">
              <span
                className={`block h-full rounded-full ${bar.fill}`}
                style={{ width: width(bar.value) }}
              />
            </span>
            <span className="font-mono text-[0.6875rem] whitespace-nowrap text-ink-muted">
              {money(bar.value)}
            </span>
          </div>
        ))}
      </div>

      <Rows>
        <Kv
          label={M.cv}
          code="CV"
          value={money(metrics.cv)}
          tone={metrics.cv === null ? "neutral" : metrics.cv >= 0 ? "good" : "bad"}
          chip={
            metrics.cv === null ? undefined : (
              <Badge
                value={metrics.cv >= 0 ? M.underBudget : M.overBudget}
                tone={metrics.cv >= 0 ? "green" : "red"}
              />
            )
          }
        />
        <Kv
          label={M.sv}
          code="SV"
          value={money(metrics.sv)}
          tone={metrics.sv === null ? "neutral" : metrics.sv >= 0 ? "good" : "bad"}
          chip={
            metrics.sv === null ? undefined : (
              <Badge
                value={metrics.sv >= 0 ? M.ahead : M.behind}
                tone={metrics.sv >= 0 ? "green" : "yellow"}
              />
            )
          }
        />
        <Kv label={M.eac} code="EAC" value={money(metrics.eac)} />
        <Kv label={M.etc} code="ETC" value={money(metrics.etc)} />
        <Kv
          label={M.vac}
          code="VAC"
          value={money(metrics.vac)}
          tone={metrics.vac === null ? "neutral" : metrics.vac >= 0 ? "good" : "bad"}
        />
        <Kv label={M.tcpi} code="TCPI" value={formatDecimal(metrics.tcpi)} />
      </Rows>

      <Note>
        {M.noteVariance}
        <br />
        {M.noteForecast}
      </Note>

      <Actions>
        <PipeButton
          value={metrics.cpi}
          label={M.useCpi}
          display={formatDecimal(metrics.cpi, 2)}
          onUse={onUse}
          primary
        />
        <PipeButton
          value={metrics.eac}
          label={M.useEac}
          display={money(metrics.eac)}
          onUse={onUse}
        />
        <PipeButton value={metrics.cv} label={M.useCv} display={money(metrics.cv)} onUse={onUse} />
      </Actions>
    </Card>
  );
}
