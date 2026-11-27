"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { messages } from "@/lib/messages";
import { percentChange, percentOf, shareOfTotal } from "../../calc/project-math";
import { formatDecimal, formatNumber, formatSignedPercent } from "../../calc/project-format";
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
  useReportValues,
  useStartValues,
} from "./card-ui";

const M = messages.financials.projectMath.percent;

function signedNumber(value: number | null) {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value))}`;
}

export function PercentCard({ onUse, initial: saved, onChange }: CardProps) {
  const startWith = useStartValues(saved, {
    change: { from: "48000", to: "52500" },
    portion: { rate: "15", amount: "8200" },
    share: { part: "34000", total: "250000" },
  });
  const [change, setChange] = useState(startWith.change);
  const [portion, setPortion] = useState(startWith.portion);
  const [share, setShare] = useState(startWith.share);
  useReportValues(onChange, { change, portion, share });

  const moved = useMemo(() => percentChange(change), [change]);
  const portionValue = useMemo(() => percentOf(portion), [portion]);
  const shareValue = useMemo(() => shareOfTotal(share), [share]);

  const rising = (moved.pct ?? 0) >= 0;
  const multiplier = formatDecimal(moved.multiplier, 3);

  return (
    <Card icon="⇅" tone="warning" name={M.name}>
      <Hero
        label={M.change}
        value={formatSignedPercent(moved.pct)}
        tone={moved.pct === null ? "neutral" : rising ? "warn" : "good"}
        testId="percent-change"
        badge={
          moved.pct === null ? null : (
            <Badge
              value={rising ? M.increase(multiplier) : M.decrease(multiplier)}
              tone={rising ? "yellow" : "green"}
            />
          )
        }
      />

      <FieldGrid>
        <Field
          label={M.from}
          value={change.from}
          onChange={(from) => setChange((previous) => ({ ...previous, from }))}
        />
        <Field
          label={M.to}
          value={change.to}
          onChange={(to) => setChange((previous) => ({ ...previous, to }))}
        />
      </FieldGrid>

      <Rows>
        <Kv
          label={M.absolute}
          value={signedNumber(moved.delta)}
          tone={moved.delta === null ? "neutral" : moved.delta >= 0 ? "good" : "bad"}
        />
      </Rows>

      <FieldGrid>
        <Field
          label={M.rate}
          code="X%"
          value={portion.rate}
          onChange={(rate) => setPortion((previous) => ({ ...previous, rate }))}
        />
        <Field
          label={M.amount}
          code="Y"
          value={portion.amount}
          onChange={(amount) => setPortion((previous) => ({ ...previous, amount }))}
        />
      </FieldGrid>

      <Rows>
        <Kv
          label={M.portion(portion.rate, portion.amount)}
          value={formatNumber(portionValue.value)}
        />
      </Rows>

      <FieldGrid>
        <Field
          label={M.part}
          code="A"
          value={share.part}
          onChange={(part) => setShare((previous) => ({ ...previous, part }))}
        />
        <Field
          label={M.total}
          code="B"
          value={share.total}
          onChange={(total) => setShare((previous) => ({ ...previous, total }))}
        />
      </FieldGrid>

      <Rows>
        <Kv
          label={M.share}
          value={shareValue.pct === null ? "—" : `${formatDecimal(shareValue.pct, 1)}%`}
        />
        <Kv label={M.remaining} value={formatNumber(shareValue.remaining)} />
      </Rows>

      <Note>{M.note}</Note>

      <Actions>
        <PipeButton
          value={moved.pct}
          label={M.useChange}
          display={formatSignedPercent(moved.pct)}
          onUse={onUse}
          primary
        />
        <PipeButton
          value={portionValue.value}
          label={M.usePortion}
          display={formatDecimal(portionValue.value, 2)}
          onUse={onUse}
        />
        <PipeButton
          value={shareValue.pct}
          label={M.useShare}
          display={formatSignedPercent(shareValue.pct)}
          onUse={onUse}
        />
      </Actions>
    </Card>
  );
}
