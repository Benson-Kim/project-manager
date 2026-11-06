"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { messages } from "@/lib/messages";
import { estimateConfidence } from "../../calc/project-analysis";
import { pert } from "../../calc/project-math";
import { formatDecimal } from "../../calc/project-format";
import {
  Actions,
  Card,
  type CardProps,
  Field,
  FieldGrid,
  Hero,
  Kv,
  MiniStat,
  Note,
  PipeButton,
  Rows,
  StaticField,
} from "./card-ui";

const M = messages.financials.projectMath.estimate;

function range(low: number | null, high: number | null) {
  return `${formatDecimal(low, 1)} – ${formatDecimal(high, 1)}`;
}

export function EstimateCard({ onUse }: CardProps) {
  const [form, setForm] = useState({
    optimistic: "5",
    mostLikely: "8",
    pessimistic: "14",
    unit: M.initialUnit,
    target: "12",
  });
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const threePoint = useMemo(
    () =>
      pert({
        optimistic: form.optimistic,
        mostLikely: form.mostLikely,
        pessimistic: form.pessimistic,
      }),
    [form.optimistic, form.mostLikely, form.pessimistic],
  );
  const confidence = useMemo(
    () =>
      estimateConfidence({ expected: threePoint.expected, sd: threePoint.sd, target: form.target }),
    [threePoint.expected, threePoint.sd, form.target],
  );

  const unit = form.unit.trim() || M.fallbackUnit;
  const ready = threePoint.expected !== null && Number.isFinite(threePoint.expected);
  const expected = threePoint.expected ?? 0;

  const position = (value: number) => {
    if (!ready) return 50;
    const low = Math.min(expected, threePoint.low95 ?? 0);
    const high = Math.max(expected, threePoint.high95 ?? 1);
    if (high === low) return 50;
    return Math.max(3, Math.min(97, ((value - low) / (high - low)) * 100));
  };

  const markers = ready
    ? [
        { key: "o", label: "O", value: Number(form.optimistic), emphasize: false },
        { key: "e", label: "E", value: expected, emphasize: true },
        { key: "p", label: "P", value: Number(form.pessimistic), emphasize: false },
      ]
    : [];

  const probability = confidence?.probability ?? null;
  const percentile = (value: number | undefined) =>
    value === undefined ? "—" : formatDecimal(value, 1);

  return (
    <Card icon="◈" name={M.name}>
      <FieldGrid>
        <Field label={M.optimistic} code="O" value={form.optimistic} onChange={set("optimistic")} />
        <Field label={M.mostLikely} code="M" value={form.mostLikely} onChange={set("mostLikely")} />
        <Field
          label={M.pessimistic}
          code="P"
          value={form.pessimistic}
          onChange={set("pessimistic")}
        />
        <Field label={M.unit} kind="text" value={form.unit} onChange={set("unit")} />
      </FieldGrid>

      <Hero
        label={M.expected}
        value={ready ? formatDecimal(expected, 1) : "—"}
        unit={ready ? unit : undefined}
        testId="pert-expected"
        badge={
          ready ? (
            <Badge
              value={threePoint.wide ? M.highUncertainty : M.sigma(formatDecimal(threePoint.sd, 2))}
              tone={threePoint.wide ? "yellow" : undefined}
            />
          ) : null
        }
      />

      {ready ? (
        <div className="relative h-11" aria-hidden="true">
          <div className="absolute inset-x-0 top-5 h-px bg-line" />
          {markers.map((marker) => (
            <div
              className="absolute top-2 size-2.5 -translate-x-1/2"
              key={marker.key}
              style={{ left: `${position(marker.value)}%` }}
            >
              <span
                className={`block size-full rounded-full ring-2 ring-surface-raised ${
                  marker.emphasize ? "bg-accent-strong" : "bg-ink-faint"
                }`}
              />
              <span className="absolute top-3 left-1/2 -translate-x-1/2 font-mono text-[0.625rem] text-ink-muted">
                {marker.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 @sm:grid-cols-4">
        <MiniStat label="P50" value={percentile(confidence?.p50)} />
        <MiniStat
          label="P80"
          testId="estimate-p80"
          value={percentile(confidence?.p80)}
          tone="accent"
        />
        <MiniStat label="P90" value={percentile(confidence?.p90)} />
        <MiniStat label="P95" value={percentile(confidence?.p95)} />
      </div>

      <FieldGrid>
        <Field label={M.target} code="T" value={form.target} onChange={set("target")} />
        <StaticField
          label={M.chance}
          testId="confidence-probability"
          value={probability === null ? "—" : `${formatDecimal(probability, 0)}%`}
          tone={
            probability === null
              ? "neutral"
              : probability >= 80
                ? "good"
                : probability >= 50
                  ? "warn"
                  : "bad"
          }
        />
      </FieldGrid>

      <Rows>
        <Kv label={M.sd} code="σ" value={ready ? formatDecimal(threePoint.sd, 2) : "—"} />
        <Kv
          label={M.variance}
          code="σ²"
          value={ready ? formatDecimal(threePoint.variance, 2) : "—"}
        />
        <Kv
          label={M.range68}
          code="±1σ"
          value={ready ? range(threePoint.low68, threePoint.high68) : "—"}
        />
        <Kv
          label={M.range95}
          code="±2σ"
          value={ready ? range(threePoint.low95, threePoint.high95) : "—"}
        />
        {confidence ? (
          <Kv label={M.cover80} value={`${formatDecimal(confidence.p80, 1)} ${unit}`} />
        ) : null}
      </Rows>

      {threePoint.inverted ? <Note tone="warning">{M.inverted}</Note> : null}
      <Note>{M.note}</Note>

      <Actions>
        <PipeButton
          value={threePoint.expected}
          label={M.useEstimate}
          display={formatDecimal(threePoint.expected, 1)}
          onUse={onUse}
          primary
        />
        <PipeButton
          value={confidence?.p80 ?? null}
          label={M.useP80}
          display={formatDecimal(confidence?.p80 ?? null, 1)}
          onUse={onUse}
        />
        <PipeButton
          value={threePoint.sd}
          label={M.useSigma}
          display={formatDecimal(threePoint.sd, 2)}
          onUse={onUse}
        />
      </Actions>
    </Card>
  );
}
