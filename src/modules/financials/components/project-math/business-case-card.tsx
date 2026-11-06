"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { messages } from "@/lib/messages";
import { businessCase } from "../../calc/project-analysis";
import { formatCurrency, formatDecimal, formatSignedPercent } from "../../calc/project-format";
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

const M = messages.financials.projectMath.businessCase;
const YEARS = [1, 2, 3, 4, 5] as const;

export function BusinessCaseCard({ onUse, currency }: CardProps) {
  const [initial, setInitial] = useState("120000");
  const [rate, setRate] = useState("10");
  const [flows, setFlows] = useState(["35000", "40000", "45000", "30000", "25000"]);

  const result = useMemo(() => businessCase({ initial, rate, flows }), [initial, rate, flows]);
  const money = (value: number | null) => formatCurrency(value, { symbol: currency });
  const positive = result.npv !== null && result.npv >= 0;

  const setFlow = (index: number, value: string) =>
    setFlows((current) => current.map((flow, at) => (at === index ? value : flow)));

  return (
    <Card icon="◭" name={M.name}>
      <FieldGrid>
        <Field label={M.initial} code="CF0" value={initial} onChange={setInitial} />
        <Field label={M.rate} code="r" value={rate} onChange={setRate} />
      </FieldGrid>

      <FieldGrid cols={5}>
        {YEARS.map((year, index) => (
          <Field
            key={year}
            label={M.year(year)}
            value={flows[index] ?? ""}
            onChange={(value) => setFlow(index, value)}
          />
        ))}
      </FieldGrid>

      <Hero
        label={M.npv}
        value={money(result.npv)}
        tone={result.npv === null ? "neutral" : positive ? "good" : "bad"}
        testId="npv"
        badge={
          result.npv === null ? null : (
            <Badge
              value={positive ? M.createsValue : M.destroysValue}
              tone={positive ? "green" : "red"}
            />
          )
        }
      />

      <Rows>
        <Kv
          label={M.irr}
          code="IRR"
          value={result.irr === null ? M.irrMissing : `${formatDecimal(result.irr, 1)}%`}
          tone={result.irr === null ? "neutral" : result.irr >= Number(rate) ? "good" : "bad"}
        />
        <Kv
          label={M.payback}
          code="yrs"
          value={
            result.paybackYears === null ? M.paybackBeyond : formatDecimal(result.paybackYears, 1)
          }
        />
        <Kv label={M.totalReturn} value={money(result.totalReturn)} />
        <Kv label={M.firstInflow} value={money(result.discounted[0] ?? null)} />
      </Rows>

      <Note>{M.note}</Note>

      <Actions>
        <PipeButton
          value={result.npv}
          label={M.useNpv}
          display={money(result.npv)}
          onUse={onUse}
          primary
        />
        <PipeButton
          value={result.irr}
          label={M.useIrr}
          display={formatSignedPercent(result.irr)}
          onUse={onUse}
        />
        <PipeButton
          value={result.paybackYears}
          label={M.usePayback}
          display={formatDecimal(result.paybackYears, 1)}
          onUse={onUse}
        />
      </Actions>
    </Card>
  );
}
