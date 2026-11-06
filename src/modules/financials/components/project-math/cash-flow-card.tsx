"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button-styles";
import { messages } from "@/lib/messages";
import { cashFlowRoi, type CashPeriod } from "../../calc/project-analysis";
import { formatCurrency, formatSignedPercent } from "../../calc/project-format";
import {
  Actions,
  Card,
  type CardProps,
  Chart,
  Field,
  Hero,
  Kv,
  Note,
  PipeButton,
  RemoveRowButton,
  Rows,
  SectionLabel,
  useRowList,
} from "./card-ui";

const M = messages.financials.projectMath.cashFlow;

const SEED: CashPeriod[] = [
  { id: 1, inflow: "15000", outflow: "5000" },
  { id: 2, inflow: "20000", outflow: "6000" },
  { id: 3, inflow: "28000", outflow: "7000" },
  { id: 4, inflow: "35000", outflow: "8000" },
  { id: 5, inflow: "42000", outflow: "8000" },
  { id: 6, inflow: "50000", outflow: "9000" },
];

export function CashFlowCard({ onUse, currency }: CardProps) {
  const [initial, setInitial] = useState("120000");
  const { rows: periods, update, add, remove } = useRowList(SEED);

  const flow = useMemo(() => cashFlowRoi({ initial, rows: periods }), [initial, periods]);
  const money = (value: number | null) => formatCurrency(value, { symbol: currency });

  const scale = Math.max(1, ...flow.rows.map((row) => Math.abs(row.cumulative)));
  const gaining = flow.roi !== null && flow.roi >= 0;
  const breakeven =
    flow.breakevenPeriod === null ? M.notReached : M.breakevenAt(flow.breakevenPeriod);

  return (
    <Card icon="≈" name={M.name}>
      <Field label={M.initial(currency)} code="CF0" value={initial} onChange={setInitial} />

      <div className="flex flex-col gap-2">
        {periods.map((row, index) => {
          const net = flow.rows[index]?.net ?? 0;
          return (
            <div className="rounded-md border border-line bg-surface p-2" key={row.id}>
              <div className="flex items-center justify-between gap-2">
                <SectionLabel>{M.period(index + 1)}</SectionLabel>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono text-xs font-semibold ${net < 0 ? "text-danger" : "text-success"}`}
                  >
                    {money(net)}
                  </span>
                  <RemoveRowButton
                    label={M.remove(index + 1)}
                    onClick={() => remove(row.id)}
                    disabled={periods.length === 1}
                  />
                </div>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <Field
                  label={M.inflow}
                  value={row.inflow}
                  onChange={(inflow) => update(row.id, { inflow })}
                />
                <Field
                  label={M.outflow}
                  value={row.outflow}
                  onChange={(outflow) => update(row.id, { outflow })}
                />
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className={`${buttonClass("secondary", "compact")} self-start`}
        onClick={() => add({ inflow: "25000", outflow: "7500" })}
      >
        {M.add}
      </button>

      <Chart
        title={M.balance}
        caption={breakeven}
        label={M.chart(flow.rows.map((row) => money(row.cumulative)).join(", "))}
        periods={flow.rows.length}
      >
        {flow.rows.map((row) => {
          const height = `${Math.max(3, (Math.abs(row.cumulative) / scale) * 100)}%`;
          const positive = row.cumulative >= 0;
          return (
            <div key={row.id} className="flex h-full flex-1 flex-col justify-center">
              <div className="flex h-1/2 items-end justify-center">
                {positive ? (
                  <div className="w-full max-w-8 rounded-t-sm bg-success" style={{ height }} />
                ) : null}
              </div>
              <div className="h-px w-full bg-ink-faint opacity-40" />
              <div className="flex h-1/2 items-start justify-center">
                {positive ? null : (
                  <div className="w-full max-w-8 rounded-b-sm bg-danger" style={{ height }} />
                )}
              </div>
            </div>
          );
        })}
      </Chart>

      <Hero
        label={M.roi}
        value={formatSignedPercent(flow.roi)}
        tone={flow.roi === null ? "neutral" : gaining ? "good" : "bad"}
        testId="cash-roi"
        badge={
          flow.roi === null ? (
            <Badge value={M.noOutlay} />
          ) : (
            <Badge
              value={gaining ? M.netGain(money(flow.finalPosition)) : M.underWater}
              tone={gaining ? "green" : "red"}
            />
          )
        }
      />

      <Rows>
        <Kv
          label={M.finalPosition}
          value={money(flow.finalPosition)}
          tone={flow.finalPosition !== null && flow.finalPosition >= 0 ? "good" : "bad"}
        />
        <Kv label={M.peakFunding} value={money(flow.peakFunding)} tone="bad" />
        <Kv
          label={M.breakeven}
          value={flow.breakevenPeriod === null ? M.notReached : M.period(flow.breakevenPeriod)}
        />
        <Kv label={M.cashIn} value={money(flow.inflowTotal)} />
        <Kv label={M.cashOut} value={money(flow.outflowTotal)} />
        <Kv label={M.netCash} value={money(flow.netTotal)} />
      </Rows>

      <Note>{M.note}</Note>

      <Actions>
        <PipeButton
          value={flow.roi}
          label={M.useRoi}
          display={formatSignedPercent(flow.roi)}
          onUse={onUse}
          primary
        />
        <PipeButton
          value={flow.peakFunding}
          label={M.usePeak}
          display={money(flow.peakFunding)}
          onUse={onUse}
        />
        <PipeButton
          value={flow.netTotal}
          label={M.useNet}
          display={money(flow.netTotal)}
          onUse={onUse}
        />
      </Actions>
    </Card>
  );
}
