"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button-styles";
import { messages } from "@/lib/messages";
import { riskExposure, type RiskRow } from "../../calc/project-analysis";
import { formatCurrency } from "../../calc/project-format";
import {
  Actions,
  Card,
  type CardProps,
  Field,
  Hero,
  Kv,
  Note,
  PipeButton,
  RemoveRowButton,
  Rows,
  StaticField,
  useRowList,
} from "./card-ui";

const M = messages.financials.projectMath.risk;

const SEED: RiskRow[] = [
  { id: 1, label: M.seed[0], probability: "30", impact: "-20000" },
  { id: 2, label: M.seed[1], probability: "20", impact: "-35000" },
  { id: 3, label: M.seed[2], probability: "40", impact: "12000" },
];

export function RiskCard({ onUse, currency }: CardProps) {
  const { rows, update, add, remove } = useRowList(SEED);
  const summary = useMemo(() => riskExposure(rows), [rows]);
  const money = (value: number | null) => formatCurrency(value, { symbol: currency });

  return (
    <Card icon="⚠" tone="danger" name={M.name}>
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => {
          const emv = summary.emvById[row.id] ?? null;
          return (
            <div className="rounded-md border border-line bg-surface p-2" key={row.id}>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Field
                    label={M.risk(index + 1)}
                    labelHidden
                    kind="text"
                    value={row.label}
                    onChange={(label) => update(row.id, { label })}
                  />
                </div>
                <RemoveRowButton
                  label={M.remove(index + 1)}
                  onClick={() => remove(row.id)}
                  disabled={rows.length === 1}
                />
              </div>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)] items-end gap-2">
                <Field
                  label={M.probability}
                  value={row.probability}
                  onChange={(probability) => update(row.id, { probability })}
                />
                <Field
                  label={M.impact(currency)}
                  value={row.impact}
                  onChange={(impact) => update(row.id, { impact })}
                />
                <StaticField
                  label={M.emv}
                  value={money(emv)}
                  tone={emv === null ? "neutral" : emv < 0 ? "bad" : "good"}
                />
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className={`${buttonClass("secondary", "compact")} self-start`}
        onClick={() => add({ label: "", probability: "20", impact: "-10000" })}
      >
        {M.add}
      </button>

      <Hero
        label={M.net}
        value={money(summary.net)}
        tone={summary.net < 0 ? "bad" : "good"}
        testId="risk-net"
        badge={<Badge value={M.valued(summary.counted)} />}
      />

      <Rows>
        <Kv label={M.threats} code="−EMV" value={money(summary.threats)} tone="bad" />
        <Kv label={M.opportunities} code="+EMV" value={money(summary.opportunities)} tone="good" />
        <Kv
          label={M.contingency}
          value={money(summary.contingency)}
          tone={summary.contingency > 0 ? "bad" : "neutral"}
        />
      </Rows>

      <Note>{M.note(summary.counted)}</Note>

      <Actions>
        <PipeButton
          value={summary.net}
          label={M.useNet}
          display={money(summary.net)}
          onUse={onUse}
          primary
        />
        <PipeButton
          value={summary.contingency}
          label={M.useContingency}
          display={money(summary.contingency)}
          onUse={onUse}
        />
      </Actions>
    </Card>
  );
}
