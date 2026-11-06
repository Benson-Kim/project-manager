"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { messages } from "@/lib/messages";
import { resourceLevel } from "../../calc/project-analysis";
import { formatDecimal, formatSignedPercent } from "../../calc/project-format";
import {
  Actions,
  Card,
  type CardProps,
  Chart,
  Field,
  FieldGrid,
  Hero,
  Kv,
  Note,
  PipeButton,
  Rows,
} from "./card-ui";

const M = messages.financials.projectMath.resource;

const utilisation = (value: number | null) => formatSignedPercent(value, 0, { signed: false });

export function ResourceCard({ onUse }: CardProps) {
  const [demand, setDemand] = useState("6, 9, 4, 11, 7");
  const [capacity, setCapacity] = useState("8");

  const result = useMemo(() => resourceLevel({ demand, capacity }), [demand, capacity]);

  const overloaded = result.overloaded.length > 0;
  const firstOverloaded = result.overloaded[0];
  const scale = Math.max(1, result.peak, result.capacity ?? 0);
  const capacityLine = result.capacity === null ? null : (result.capacity / scale) * 100;
  const extra = Math.max(0, result.extraPeriods ?? 0);

  return (
    <Card icon="⇶" name={M.name}>
      <FieldGrid>
        <Field label={M.demand} code="d₁…dₙ" kind="text" value={demand} onChange={setDemand} />
        <Field label={M.capacity} code="c" value={capacity} onChange={setCapacity} />
      </FieldGrid>

      <Chart
        title={M.chartTitle}
        caption={M.caption(
          formatDecimal(result.periods, 0),
          formatDecimal(result.peak, 0),
          formatDecimal(result.capacity, 0),
        )}
        label={M.chart(result.demand.join(", ") || M.none)}
        periods={result.demand.length}
      >
        {result.demand.map((value, index) => (
          <div key={index} className="flex h-full flex-1 items-end justify-center">
            <div
              className={`w-full rounded-t-sm ${
                result.capacity !== null && value > result.capacity
                  ? "bg-danger"
                  : "bg-accent-strong"
              }`}
              style={{ height: `${Math.max(4, (value / scale) * 100)}%` }}
            />
          </div>
        ))}
        {capacityLine === null ? null : (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-warning"
            style={{ bottom: `${capacityLine}%` }}
          />
        )}
      </Chart>

      <Hero
        label={M.utilisation}
        value={utilisation(result.utilisation)}
        tone={result.utilisation === null ? "neutral" : overloaded ? "bad" : "good"}
        testId="resource-utilisation"
        badge={
          <Badge
            value={overloaded ? M.overCapacity(result.overloaded.length) : M.insideCapacity}
            tone={overloaded ? "red" : "green"}
          />
        }
      />

      <Rows>
        <Kv label={M.total} value={formatDecimal(result.total, 1)} />
        <Kv label={M.average} value={formatDecimal(result.average, 2)} />
        <Kv
          label={M.peak}
          code="max"
          value={formatDecimal(result.peak, 1)}
          tone={overloaded ? "bad" : "neutral"}
        />
        <Kv
          label={M.overload}
          code="+"
          value={formatDecimal(result.worstOverload, 1)}
          tone={result.worstOverload > 0 ? "bad" : "neutral"}
        />
        <Kv
          label={M.overloaded}
          value={
            overloaded
              ? result.overloaded
                  .map((period) => messages.financials.projectMath.periodShort(period))
                  .join(", ")
              : M.none
          }
          tone={overloaded ? "bad" : "good"}
        />
        <Kv
          label={M.levelledFinish}
          value={result.levelledPeriods === null ? "—" : M.periods(result.levelledPeriods)}
        />
        <Kv
          label={M.impact}
          value={result.extraPeriods === null ? "—" : `+${M.periods(extra)}`}
          tone={extra > 0 ? "bad" : "neutral"}
        />
        <Kv label={M.sameSpan} value={formatDecimal(result.capacityForSameSpan, 0)} />
      </Rows>

      <Note tone={overloaded ? "warning" : "muted"}>
        {firstOverloaded === undefined
          ? M.inside
          : M.spill(firstOverloaded, formatDecimal(result.worstOverload, 1))}
      </Note>

      <Actions>
        <PipeButton
          value={result.peak}
          label={M.usePeak}
          display={formatDecimal(result.peak, 0)}
          onUse={onUse}
          primary
        />
        <PipeButton
          value={result.utilisation}
          label={M.useUtilisation}
          display={utilisation(result.utilisation)}
          onUse={onUse}
        />
        <PipeButton
          value={result.levelledPeriods}
          label={M.useLevelled}
          display={formatDecimal(result.levelledPeriods, 0)}
          onUse={onUse}
        />
      </Actions>
    </Card>
  );
}
